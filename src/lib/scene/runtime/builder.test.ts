import { describe, expect, it, vi } from 'vitest';
import { createScene } from './builder.svelte.js';
import { SceneManager } from './runtime.svelte.js';
import { WaitStep } from './steps.js';
import { getSceneManager } from './context.svelte.js';

vi.mock('./context.svelte.js', () => ({
	getSceneManager: vi.fn()
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
