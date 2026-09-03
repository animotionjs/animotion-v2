import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneManager, type TransitionBuild } from '../scene/runtime/runtime.svelte.js';
import { TickStep, TweenStep, type Step } from '../scene/runtime/steps.js';
import { TimelineController } from './timeline.svelte.js';

const linear = (p: number) => p;

/**
 * Replaces the browser frame loop with a manual clock so controller playback
 * can be advanced deterministically, one frame at a time.
 */
function stubFrames() {
	let callback: ((now: number) => void) | null = null;
	let now: number | null = null;
	vi.stubGlobal('requestAnimationFrame', (cb: (now: number) => void) => {
		// the clock starts at the first frame request so the first delta stays tiny
		now ??= performance.now();
		callback = cb;
		return 1;
	});
	vi.stubGlobal('cancelAnimationFrame', () => {
		callback = null;
	});
	return {
		advance(seconds: number) {
			now = (now ?? 0) + seconds * 1000;
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

describe('TimelineController stepping', () => {
	/**
	 * A scene whose segments all sit on the 30fps frame grid: an enter of
	 * 0.5s, a hold of 0.5s, a step of 1s, then a step of 0.5s with a 0.5s
	 * wait, 3 seconds total.
	 */
	function griddedController() {
		const manager = new SceneManager();
		const tail: Step = new TickStep(() => {}, 0.5);
		tail.wait = 0.5;
		manager.load({
			steps: [new TickStep(() => {}, 1), tail],
			holdBeforeFirstStep: 0.5,
			enterBuild: (b) => {
				b.tween('opacity', 1, 0.5, linear);
			}
		});
		return new TimelineController(manager, 30);
	}

	it('snaps onto the frame grid and clamps to the scene', () => {
		const controller = griddedController();
		expect(controller.snap(0.4)).toBeCloseTo(0.4, 6);
		expect(controller.snap(0.017)).toBeCloseTo(1 / 30, 6);
		expect(controller.snap(-5)).toBe(0);
		expect(controller.snap(99)).toBeCloseTo(3, 6);
	});

	it('lands the last frame on the exact duration', () => {
		const controller = griddedController();
		expect(controller.snap(3)).toBe(3);
		expect(controller.snap(2.999999)).toBe(3);
	});

	it('treats a seek within the current frame as a no-op', () => {
		const manager = new SceneManager();
		manager.load({ steps: [new TickStep(() => {}, 1)] });
		const spy = vi.spyOn(manager, 'seekToTime');
		const controller = new TimelineController(manager, 30);

		controller.seekTo(0.5);
		expect(spy).toHaveBeenCalledTimes(1);
		controller.seekTo(0.5);
		expect(spy).toHaveBeenCalledTimes(1);
		// playback drifts off the grid by float dust, which must not trigger a rebuild
		controller.time += 1e-12;
		controller.seekTo(0.5);
		expect(spy).toHaveBeenCalledTimes(1);

		controller.seekTo(0.6);
		expect(spy).toHaveBeenCalledTimes(2);
		controller.destroy();
	});

	it('lays out boundaries across enter, hold, steps and waits', () => {
		const controller = griddedController();
		expect(controller.boundaries()).toEqual([0, 0.5, 2, 3]);
	});

	it('jumps between segment boundaries', () => {
		const controller = griddedController();
		controller.seekTo(2.5);
		expect(controller.time).toBeCloseTo(2.5, 6);
		controller.jumpPrev();
		expect(controller.time).toBeCloseTo(2, 6);
		controller.jumpPrev();
		expect(controller.time).toBeCloseTo(0.5, 6);
		controller.jumpPrev();
		expect(controller.time).toBe(0);
		controller.jumpNext();
		expect(controller.time).toBeCloseTo(0.5, 6);
		// a playhead resting on a boundary moves past it, not onto it again
		controller.seekTo(2);
		controller.jumpNext();
		expect(controller.time).toBeCloseTo(3, 6);
		controller.seekTo(2);
		controller.jumpPrev();
		expect(controller.time).toBeCloseTo(0.5, 6);
	});
});

describe('TimelineController playback edge cases', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('wraps to the start and keeps playing when looping', async () => {
		const frames = stubFrames();
		const state = { x: 0 };
		const manager = new SceneManager();
		manager.enableRenderMode();
		manager.load({ steps: [new TweenStep(state, 'x', 100, 0.5, linear)] });

		const controller = new TimelineController(manager, 30);
		controller.loop = true;
		controller.play();

		let reachedEnd = false;
		let wrapped = false;
		for (let i = 0; i < 40 && !wrapped; i++) {
			frames.advance(1 / 30);
			await new Promise((resolve) => setTimeout(resolve, 0));
			if (controller.time > 0.49) reachedEnd = true;
			else if (reachedEnd) wrapped = true;
		}

		expect(wrapped).toBe(true);
		expect(controller.playing).toBe(true);
		expect(state.x).toBeLessThan(100);
		controller.destroy();
	});

	it('advances time at the configured speed', async () => {
		const frames = stubFrames();
		const manager = new SceneManager();
		manager.enableRenderMode();
		manager.load({ steps: [new TickStep(() => {}, 2)] });

		const controller = new TimelineController(manager, 30);
		controller.speed = 2;
		controller.play();

		frames.advance(0.25);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(controller.time).toBeCloseTo(0.5, 5);
		expect(controller.playing).toBe(true);
		controller.destroy();
	});
});
