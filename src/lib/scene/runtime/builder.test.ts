import { describe, expect, it, vi } from 'vitest';
import { onMount } from 'svelte';
import { createScene, type SceneBuilder } from './builder.svelte.js';
import { SceneManager } from './runtime.svelte.js';
import { WaitStep } from './steps.js';
import { getSceneManager } from './context.svelte.js';

vi.mock('./context.svelte.js', () => ({
	getSceneManager: vi.fn(),
	getSceneId: vi.fn()
}));

// `createScene` registers its steps with `onMount`; outside a component the
// real lifecycle throws, so the tests drive the manager directly.
vi.mock('svelte', async (importOriginal) => {
	const actual = await importOriginal<typeof import('svelte')>();
	return { ...actual, onMount: vi.fn() };
});

function setupManager() {
	const manager = new SceneManager();
	vi.mocked(getSceneManager).mockReturnValue(manager as never);
	return manager;
}

describe('createScene step/progress', () => {
	it('exposes the current step and step progress, driven by the manager', () => {
		const manager = setupManager();
		const scene = createScene({});

		expect(scene.step).toBe(0);
		expect(scene.progress).toBe(0);

		manager.enableRenderMode();
		manager.load({ steps: [new WaitStep(1), new WaitStep(1)] });

		manager.next();
		expect(scene.step).toBe(0);
		expect(scene.progress).toBeGreaterThanOrEqual(0);

		manager.advanceFrame(1);
		expect(scene.progress).toBe(1);

		manager.next();
		expect(scene.step).toBe(1);
		expect(scene.progress).toBe(0);
	});

	it('is read-only', () => {
		setupManager();
		const scene = createScene({});

		const writable = scene as { step: number; progress: number };
		expect(() => {
			writable.step = 5;
		}).toThrow();
		expect(() => {
			writable.progress = 0.5;
		}).toThrow();

		expect(scene.step).toBe(0);
		expect(scene.progress).toBe(0);
	});

	it('rejects reserved step/progress initial keys', () => {
		setupManager();
		expect(() => createScene({ step: 1 })).toThrow(/reserved/);
		expect(() => createScene({ progress: 1 })).toThrow(/reserved/);
	});

	it('leaves the caller initial object untouched and reusable', () => {
		setupManager();
		const initial = { x: 1, indent: '\t' };

		createScene(initial);
		createScene(initial);

		expect(initial).toEqual({ x: 1, indent: '\t' });
		expect('step' in initial).toBe(false);
		expect('progress' in initial).toBe(false);
	});

	it('accepts a frozen initial object', () => {
		setupManager();
		const scene = createScene(Object.freeze({ x: 1 }));

		expect(scene.x).toBe(1);
		expect(scene.step).toBe(0);
	});
});

describe('createScene repeat', () => {
	function stepsAfter(configure: (scene: SceneBuilder<Record<string, unknown>>) => void) {
		const manager = setupManager();
		let durations: number[] = [];
		const mount = vi.fn<(fn: () => void) => void>();
		vi.mocked(onMount).mockImplementation((fn: () => void) => mount(fn));
		vi.spyOn(manager, 'load').mockImplementation(({ steps }) => {
			durations = steps.map((step) => step.duration);
		});

		const scene = createScene({});
		configure(scene);
		mount.mock.calls[0]?.[0]?.();

		return { durations, manager };
	}

	it('appends the callback steps once per repetition', () => {
		const { durations } = stepsAfter((scene) => {
			scene.repeat(3, (s) => s.wait(1));
		});

		expect(durations).toEqual([1, 1, 1]);
	});

	it('passes the repetition index to the callback', () => {
		const { durations } = stepsAfter((scene) => {
			scene.repeat(2, (s, i) => s.wait(i + 1));
		});

		expect(durations).toEqual([1, 2]);
	});

	it('rejects a negative or non-integer count', () => {
		setupManager();
		const scene = createScene({});

		expect(() => scene.repeat(-1, () => {})).toThrow(/count/);
		expect(() => scene.repeat(1.5, () => {})).toThrow(/count/);
	});
});

describe('createScene reveal', () => {
	function loadTwoSteps(manager: SceneManager) {
		manager.enableRenderMode();
		manager.load({ steps: [new WaitStep(1), new WaitStep(1)] });
	}

	it('fades item i in as step i plays and keeps earlier items visible', () => {
		const manager = setupManager();
		const scene = createScene({});
		const opacity = scene.reveal();
		loadTwoSteps(manager);

		expect(opacity(0)).toBe(0);
		expect(opacity(1)).toBe(0);

		manager.next();
		manager.advanceFrame(0.5);
		expect(opacity(0)).toBeCloseTo(0.5);
		expect(opacity(1)).toBe(0);

		manager.advanceFrame(0.5);
		expect(opacity(0)).toBe(1);
		expect(opacity(1)).toBe(0);

		manager.next();
		manager.advanceFrame(1);
		expect(opacity(0)).toBe(1);
		expect(opacity(1)).toBe(1);
	});

	it('with lead 1 pre-reveals item 0 before any step plays', () => {
		const manager = setupManager();
		const scene = createScene({});
		const opacity = scene.reveal(1);
		loadTwoSteps(manager);

		expect(opacity(0)).toBe(1);
		expect(opacity(1)).toBe(0);
	});
});

describe('createScene crossfade', () => {
	it('fades the current item out, swaps at the midpoint, fades the next in', () => {
		const manager = setupManager();
		const scene = createScene({});
		const fade = scene.crossfade(['a', 'b']);
		manager.enableRenderMode();
		manager.load({ steps: [new WaitStep(1)] });

		expect(fade.index).toBe(0);
		expect(fade.item).toBe('a');
		expect(fade.opacity).toBe(1);

		manager.next();
		manager.advanceFrame(0.25);
		expect(fade.item).toBe('a');
		expect(fade.opacity).toBeCloseTo(0.5);

		manager.advanceFrame(0.25);
		expect(fade.index).toBe(1);
		expect(fade.item).toBe('b');
		expect(fade.opacity).toBeCloseTo(0);

		manager.advanceFrame(0.5);
		expect(fade.item).toBe('b');
		expect(fade.opacity).toBe(1);
	});
});
