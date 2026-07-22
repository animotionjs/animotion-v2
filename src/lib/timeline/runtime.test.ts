import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SceneManager, PAUSE } from './runtime.svelte';
import { signalManager } from './signal.svelte';

function managerWithScene(factory: () => Generator) {
	const m = new SceneManager();
	m.attach(factory);
	return m;
}

describe('SceneManager.prev', () => {
	let rafId: number;
	let origRAF: typeof requestAnimationFrame;
	let origCAF: typeof cancelAnimationFrame;

	beforeEach(() => {
		origRAF = globalThis.requestAnimationFrame;
		origCAF = globalThis.cancelAnimationFrame;
		rafId = 0;
		globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
			cb(performance.now());
			return ++rafId;
		}) as typeof requestAnimationFrame;
		globalThis.cancelAnimationFrame = vi.fn();
		signalManager.currentManager = null;
	});

	afterEach(() => {
		globalThis.requestAnimationFrame = origRAF;
		globalThis.cancelAnimationFrame = origCAF;
		signalManager.currentManager = null;
	});

	it('does nothing when step is 0', async () => {
		const manager = new SceneManager();
		expect(manager.step).toBe(0);
		await manager.prev();
		expect(manager.step).toBe(0);
	});

	it('does nothing on a fresh attach (step 0)', async () => {
		const manager = managerWithScene(function* () {
			yield PAUSE;
		});
		expect(manager.step).toBe(0);
		await manager.prev();
		expect(manager.step).toBe(0);
	});

	it('steps back by one after advancing past a pause', async () => {
		const manager = managerWithScene(function* () {
			yield PAUSE;
			yield PAUSE;
		});
		manager.next();
		expect(manager.step).toBe(1);
		expect(manager.finished).toBe(true);

		await manager.prev();
		expect(manager.step).toBe(0);
		expect(manager.finished).toBe(false);
	});

	it('re-runs the factory when stepping back', async () => {
		let runCount = 0;
		const factory = function* () {
			runCount++;
			yield PAUSE;
			yield PAUSE;
		};
		const manager = managerWithScene(factory);
		manager.next();
		expect(runCount).toBe(1);

		await manager.prev();
		expect(runCount).toBe(2);
		expect(manager.step).toBe(0);
	});

	it('supports multiple prev calls', async () => {
		const manager = managerWithScene(function* () {
			yield PAUSE;
			yield PAUSE;
			yield PAUSE;
		});
		manager.next();
		expect(manager.step).toBe(2);

		await manager.prev();
		expect(manager.step).toBe(1);

		await manager.prev();
		expect(manager.step).toBe(0);

		await manager.prev();
		expect(manager.step).toBe(0);
	});

	it('can go forward again after stepping back', async () => {
		const manager = managerWithScene(function* () {
			yield PAUSE;
			yield PAUSE;
		});
		manager.next();
		expect(manager.step).toBe(1);

		await manager.prev();
		expect(manager.step).toBe(0);
		expect(manager.finished).toBe(false);

		manager.next();
		expect(manager.step).toBe(1);
		expect(manager.finished).toBe(true);
	});
});
