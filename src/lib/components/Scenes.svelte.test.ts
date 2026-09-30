import { flushSync, mount, unmount } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Scenes from './Scenes.svelte';
import ScenesFixture from './fixtures/ScenesFixture.svelte';
import SteppedScene from './fixtures/SteppedScene.svelte';
import TransitionScene from './fixtures/TransitionScene.svelte';
import type { Plugin, PluginContext, PresentationState } from '../plugins/types';
import type { Sequence } from '../scene/runtime/sequence.js';

vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve()),
	afterNavigate: vi.fn(() => () => {}),
	beforeNavigate: vi.fn(() => () => {})
}));

/* Mutable so a test can land on a scene, or on a render url, before mounting. */
const { pageMock } = vi.hoisted(() => ({
	pageMock: {
		params: {} as Record<string, string>,
		url: new URL('http://localhost/presentation/banana')
	}
}));

vi.mock('$app/state', () => ({ page: pageMock }));

const sequence: Sequence = [
	{ id: 'intro', order: 1, component: () => Promise.resolve({ default: ScenesFixture }) }
];

function spyPlugin() {
	const setup = vi.fn(() => {});
	const plugin: Plugin = { name: 'spy', setup };
	return { plugin, setup };
}

beforeEach(() => {
	document.body.innerHTML = '';
	vi.clearAllMocks();
	// no scene param, so mounts land on the named-url redirect path
	pageMock.params = {};
	pageMock.url = new URL('http://localhost/presentation/banana');
});

describe('Scenes plugin lifecycle', () => {
	it('sets plugins up when landing without a scene in the url', async () => {
		const { plugin, setup } = spyPlugin();
		const app = mount(Scenes, {
			target: document.body,
			props: { sequence, plugins: [plugin], base: '/presentation/banana' }
		});
		flushSync();

		/* The redirect is a same-route replace, so this mount is the only one. */
		await vi.waitFor(() => expect(setup).toHaveBeenCalledOnce());

		unmount(app);
	});
});

describe('Scenes scene handoff', () => {
	const handoff: Sequence = [
		{ id: 'intro', order: 1, component: () => Promise.resolve({ default: TransitionScene }) },
		{ id: 'outro', order: 2, component: () => Promise.resolve({ default: TransitionScene }) }
	];

	it('keeps the leaving scene mounted while the next one enters', async () => {
		const app = mount(Scenes, {
			target: document.body,
			props: { sequence: handoff, base: '/presentation/banana' }
		});

		await vi.waitFor(() =>
			expect(document.querySelectorAll('[data-testid="stage-scene"]')).toHaveLength(1)
		);

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

		/* both scenes animate at once, with the entering one on top */
		await vi.waitFor(() => expect(document.querySelectorAll('[data-scene-stage]')).toHaveLength(2));
		expect(document.querySelectorAll('[data-active]')).toHaveLength(1);
		expect(document.querySelector('[data-active] [data-testid="stage-scene"]')?.textContent).toBe(
			'outro'
		);

		/* the leaving scene unmounts once its exit finishes */
		await vi.waitFor(
			() => expect(document.querySelectorAll('[data-scene-stage]')).toHaveLength(1),
			{ timeout: 3000 }
		);
		expect(document.querySelector('[data-testid="stage-scene"]')?.textContent).toBe('outro');

		unmount(app);
	});

	it('applies a plugin navigation requested while a handoff is running', async () => {
		let ctx: PluginContext | undefined;
		const plugin: Plugin = {
			name: 'navigator',
			setup(pluginCtx) {
				ctx = pluginCtx;
			}
		};
		const app = mount(Scenes, {
			target: document.body,
			props: { sequence: handoff, plugins: [plugin], base: '/presentation/banana' }
		});

		await vi.waitFor(() =>
			expect(document.querySelector('[data-testid="stage-scene"]')?.textContent).toBe('intro')
		);

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
		await vi.waitFor(() => expect(document.querySelectorAll('[data-scene-stage]')).toHaveLength(2));

		/* the handoff is still running, so the request can only be queued */
		void ctx?.navigateTo('intro');
		expect(document.querySelectorAll('[data-scene-stage]')).toHaveLength(2);

		await vi.waitFor(
			() => {
				expect(document.querySelectorAll('[data-scene-stage]')).toHaveLength(1);
				expect(
					document.querySelector('[data-active] [data-testid="stage-scene"]')?.textContent
				).toBe('intro');
			},
			{ timeout: 3000 }
		);

		unmount(app);
	});
});

describe('Scenes scene change snapshot', () => {
	const handoff: Sequence = [
		{ id: 'intro', order: 1, component: () => Promise.resolve({ default: TransitionScene }) },
		{ id: 'outro', order: 2, component: () => Promise.resolve({ default: SteppedScene }) }
	];

	it('reports the new scene with its own step fields', async () => {
		const states: PresentationState[] = [];
		let ctx: PluginContext | undefined;
		const plugin: Plugin = {
			name: 'snapshot',
			setup(pluginCtx) {
				ctx = pluginCtx;
			},
			onSceneChange() {
				if (ctx) states.push({ ...ctx.state });
			}
		};

		const app = mount(Scenes, {
			target: document.body,
			props: { sequence: handoff, plugins: [plugin], base: '/presentation/banana' }
		});

		await vi.waitFor(() =>
			expect(document.querySelector('[data-testid="stage-scene"]')?.textContent).toBe('intro')
		);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

		/*
		 * The outgoing scene is finished, so a snapshot that still carried
		 * its fields would report no steps and a finished scene.
		 */
		await vi.waitFor(() => expect(states).toHaveLength(1));
		expect(states[0]).toMatchObject({
			sceneId: 'outro',
			sceneIndex: 1,
			step: 0,
			totalSteps: 1,
			finished: false
		});

		unmount(app);
	});
});

describe('Scenes step reporting', () => {
	const sequence: Sequence = [
		{ id: 'stepped', order: 1, component: () => Promise.resolve({ default: SteppedScene }) },
		{ id: 'plain', order: 2, component: () => Promise.resolve({ default: TransitionScene }) }
	];

	it('does not announce a scene change for a step inside the scene', async () => {
		const changes: string[] = [];
		const setup = vi.fn();
		const plugin: Plugin = {
			name: 'changes',
			setup,
			onSceneChange(scene) {
				changes.push(scene.id);
			}
		};

		const app = mount(Scenes, {
			target: document.body,
			props: { sequence, plugins: [plugin], base: '/presentation/banana' }
		});

		await vi.waitFor(() =>
			expect(document.querySelector('[data-testid="stage-scene"]')?.textContent).toBe('stepped')
		);
		/* wired up, so an empty list means no scene change was announced */
		await vi.waitFor(() => expect(setup).toHaveBeenCalledOnce());

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

		/* the step tween runs to completion, with no scene change around it */
		await vi.waitFor(() =>
			expect(
				Number(document.querySelector<HTMLElement>('[data-testid="stage-step"]')?.style.opacity)
			).toBe(1)
		);
		expect(changes).toEqual([]);

		unmount(app);
	});
});

describe('Scenes render mode', () => {
	const handoff: Sequence = [
		{ id: 'intro', order: 1, component: () => Promise.resolve({ default: TransitionScene }) },
		{ id: 'outro', order: 2, component: () => Promise.resolve({ default: TransitionScene }) }
	];

	it('mounts the previous scene as a guest and drives both on one clock', async () => {
		pageMock.params = { scene: 'outro' };
		pageMock.url = new URL('http://localhost/presentation/banana/outro?render&previous=intro');

		const app = mount(Scenes, {
			target: document.body,
			props: { sequence: handoff, base: '/presentation/banana' }
		});
		flushSync();

		/* the component awaits fonts before it renders, so the bridge arrives late */
		await vi.waitFor(() => expect(window.__sequenceRenderer).toBeDefined());
		const bridge = window.__sequenceRenderer!;
		await bridge.ready;

		/* the guest sits at its finished frame while the scene enters from nothing */
		const stages = [...document.querySelectorAll<HTMLElement>('[data-scene-stage] section')];
		expect(stages).toHaveLength(2);
		expect(stages[0]!.style.opacity).toBe('1');
		expect(stages[1]!.style.opacity).toBe('0');

		/* half way through, the enter and the exit are both mid flight */
		expect(bridge.advanceFrame(0.1).done).toBe(false);
		expect(stages[0]!.style.opacity).toBeCloseTo(0.5, 1);
		expect(stages[1]!.style.opacity).toBeCloseTo(0.5, 1);

		/* both finish on the same tick, then the guest unmounts */
		expect(bridge.advanceFrame(0.1).done).toBe(true);
		await vi.waitFor(() => expect(document.querySelectorAll('[data-scene-stage]')).toHaveLength(1));

		unmount(app);
	});
});
