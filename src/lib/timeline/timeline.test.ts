import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneManager, type TransitionBuild } from '../scene/runtime/runtime.svelte.js';
import { TickStep, TweenStep } from '../scene/runtime/steps.js';
import { TimelineController } from './timeline.svelte.js';

const linear = (p: number) => p;

/**
 * Replaces the browser frame loop with a manual clock so controller playback
 * can be advanced deterministically, one frame at a time.
 */
function stubFrames() {
	let callback: ((now: number) => void) | null = null;
	let now = performance.now();
	vi.stubGlobal('requestAnimationFrame', (cb: (now: number) => void) => {
		callback = cb;
		return 1;
	});
	vi.stubGlobal('cancelAnimationFrame', () => {
		callback = null;
	});
	return {
		advance(seconds: number) {
			now += seconds * 1000;
			const frame = callback;
			callback = null;
			frame?.(now);
		}
	};
}

describe('TimelineController playback', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('plays every step in order after the enter transition', async () => {
		const frames = stubFrames();
		const enter: TransitionBuild = (b) => {
			b.set('opacity', 0);
			b.tween('opacity', 1, 0.4, linear);
		};
		let firstStepTime = 0;
		const state = { x: 0 };
		const manager = new SceneManager();
		manager.enableRenderMode();
		manager.load({
			steps: [
				new TickStep((frame) => (firstStepTime = Math.max(firstStepTime, frame.time)), 0.6),
				new TweenStep(state, 'x', 100, 0.6, linear)
			],
			enterBuild: enter
		});

		const controller = new TimelineController(manager, 30);
		controller.play();

		/*
		 * Settle microtasks between frames so an already finished transition
		 * can't fire an extra next() behind our back.
		 */
		for (let i = 0; i < 60 && !manager.finished; i++) {
			frames.advance(1 / 30);
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		expect(firstStepTime).toBeGreaterThanOrEqual(0.59);
		expect(manager.finished).toBe(true);
		expect(controller.time).toBeCloseTo(1.6, 1);
		expect(state.x).toBe(100);
		controller.destroy();
	});
});
