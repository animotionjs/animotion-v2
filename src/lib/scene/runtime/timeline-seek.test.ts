import { describe, expect, it } from 'vitest';
import { SceneManager, type TransitionBuild } from './runtime.svelte';
import { TickStep, TweenStep, type Step } from './steps';

const linear = (p: number) => p;

function loadedManager(
	steps: Parameters<SceneManager['load']>[0]['steps'],
	holdBeforeFirstStep = 0
) {
	const manager = new SceneManager();
	manager.enableRenderMode();
	manager.load({ steps, holdBeforeFirstStep });
	return manager;
}

/** Drives the scene to completion in fixed quanta, returning how many it took. */
function runToEnd(manager: SceneManager, quantum = 0.05, maxFrames = 2000) {
	let frames = 0;
	while (!manager.finished && frames < maxFrames) {
		manager.advanceFrame(quantum);
		frames++;
	}
	expect(frames).toBeLessThan(maxFrames);
}

describe('SceneManager.timeline metadata', () => {
	it('reports per-step durations, waits, hold and totals', () => {
		const manager = new SceneManager();
		const first: Step = new TweenStep({ x: 0 }, 'x', 1, 1);
		first.wait = 0.5;
		manager.load({
			steps: [first, new TickStep(() => {}, 0.25)],
			holdBeforeFirstStep: 2
		});

		expect(manager.timeline).toEqual({
			enterDuration: 0,
			introHold: 2,
			steps: [
				{ duration: 1, wait: 0.5 },
				{ duration: 0.25, wait: 0 }
			],
			totalDuration: 3.75
		});
	});

	it('measures the enter transition as its longest tween', () => {
		const manager = new SceneManager();
		const enter: TransitionBuild = (b) => {
			b.set('opacity', 0);
			b.tween('opacity', 1, 0.3);
			b.tween('y', 0, 0.8);
		};
		const scene = createSceneWithEnter(manager, enter);
		void scene;

		expect(manager.timeline.enterDuration).toBe(0.8);
		expect(manager.timeline.totalDuration).toBeCloseTo(0.8 + 0.5);
	});

	function createSceneWithEnter(manager: SceneManager, enter: TransitionBuild) {
		manager.load({ steps: [new TweenStep({ y: 0 }, 'y', 1, 0.5)], enterBuild: enter });
		return manager;
	}
});

describe('SceneManager.seekToTime', () => {
	it('freezes a tween at its exact intermediate value', () => {
		const state = { x: 0 };
		const manager = loadedManager([new TweenStep(state, 'x', 100, 1, linear)]);

		manager.seekToTime(0.4);
		expect(state.x).toBeCloseTo(40);
		expect(manager.stepProgress).toBeCloseTo(0.4);
		expect(manager.finished).toBe(false);

		// scrubbing backwards restores the earlier pose exactly
		manager.seekToTime(0.15);
		expect(state.x).toBeCloseTo(15);

		// landing on the animation end completes the step
		manager.seekToTime(1);
		expect(state.x).toBe(100);
	});

	it('lands completed inside a wait tail and still resumes waiting on play', () => {
		const state = { x: 0 };
		const step: Step = new TweenStep(state, 'x', 100, 0.5, linear);
		step.wait = 1;
		const manager = loadedManager([step]);

		manager.seekToTime(0.75);
		expect(state.x).toBeCloseTo(100);
		expect(manager.stepCompleted).toBe(true);
		expect(manager.finished).toBe(false);

		manager.play();
		runToEnd(manager, 0.25);
		expect(manager.finished).toBe(true);
	});

	it('keeps the initial state through the intro hold', () => {
		const state = { x: 7 };
		const manager = loadedManager([new TweenStep(state, 'x', 100, 1, linear)], 0.5);

		manager.seekToTime(0.25);
		expect(state.x).toBe(7);
		expect(manager.step).toBe(0);
		expect(manager.playing).toBe(false);

		// past the hold the tween has started from the initial value
		manager.seekToTime(0.75);
		expect(state.x).toBeCloseTo(7 + 93 * 0.25);
	});

	it('commits earlier steps and positions the targeted one', () => {
		const state = { x: 0 };
		const manager = loadedManager([
			new TweenStep(state, 'x', 100, 1, linear),
			new TweenStep(state, 'x', 0, 1, linear)
		]);

		manager.seekToTime(1.5);
		expect(manager.step).toBe(1);
		expect(manager.stepCompleted).toBe(false);
		// first step committed to its end value, second halfway back down
		expect(state.x).toBeCloseTo(50);
	});

	it('finishes the scene past the end and rests at the start at zero', () => {
		const state = { x: 0 };
		const manager = loadedManager([new TweenStep(state, 'x', 100, 1, linear)]);

		manager.seekToTime(99);
		expect(manager.finished).toBe(true);
		expect(state.x).toBe(100);

		manager.seekToTime(0);
		expect(manager.finished).toBe(false);
		expect(state.x).toBe(0);
	});

	it('resumes playback from the seeked position via play()', () => {
		const state = { x: 0 };
		const step = new TweenStep(state, 'x', 100, 1, linear);
		const manager = loadedManager([step], 0.5);

		// half a second of hold followed by 0.9 seconds into the animation
		manager.seekToTime(1.4);
		expect(state.x).toBeCloseTo(90);

		manager.play();
		runToEnd(manager, 0.02);
		expect(state.x).toBe(100);
		expect(manager.finished).toBe(true);
	});

	it('a boundary time lands on the following segment start', () => {
		const state = { x: 0 };
		const manager = loadedManager([
			new TweenStep(state, 'x', 100, 1, linear),
			new TickStep(() => {}, 1)
		]);

		manager.seekToTime(1);
		expect(manager.step).toBe(1);
		expect(manager.stepCompleted).toBe(false);
		expect(state.x).toBe(100);
	});

	it('handles zero-duration steps and clamps out-of-range times', () => {
		const state = { x: 0 };
		const beat: Step = new TickStep(() => {}, 0);
		beat.wait = 0.5;
		const manager = loadedManager([beat, new TweenStep(state, 'x', 100, 1, linear)]);

		manager.seekToTime(-5);
		expect(state.x).toBe(0);

		manager.seekToTime(0.2);
		expect(manager.stepCompleted).toBe(true);

		manager.seekToTime(0.5);
		expect(manager.step).toBe(1);
		expect(state.x).toBe(0);
	});

	it('treats any position in an empty scene as finished', () => {
		const manager = new SceneManager();
		manager.load({ steps: [] });
		manager.seekToTime(3);
		expect(manager.finished).toBe(true);
	});
});

describe('SceneManager.seekToTime (enter transition)', () => {
	const enter: TransitionBuild = (b) => {
		b.set('opacity', 0);
		b.tween('opacity', 1, 0.8, linear);
	};

	function enteredManager() {
		const state = { y: 5 };
		const manager = new SceneManager();
		manager.enableRenderMode();
		manager.load({
			steps: [new TweenStep(state, 'y', 50, 1, linear)],
			enterBuild: enter
		});
		return { manager, state };
	}

	it('freezes the transition mid-flight without touching the steps', () => {
		const { manager, state } = enteredManager();

		manager.seekToTime(0.4);
		expect(manager.transitionState.opacity).toBeCloseTo(0.5);
		expect(state.y).toBe(5);
		expect(manager.step).toBe(0);

		manager.seekToTime(0);
		expect(manager.transitionState.opacity).toBe(1);
	});

	it('plays the enter transition onward from a scrubbed position', async () => {
		const { manager } = enteredManager();

		manager.seekToTime(0.4);
		const playing = manager.playEnter(0.5);
		let guard = 0;
		while (guard++ < 200) {
			if (manager.advanceFrame(0.05).done) break;
		}
		await playing;

		expect(manager.transitionState.opacity).toBe(1);
	});
});

describe('SceneManager.disableRenderMode', () => {
	it('returns to live scheduling where waits are skipped again', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		const beat: Step = new TickStep(() => {}, 0);
		beat.wait = 10;
		manager.load({ steps: [beat] });

		manager.next();
		expect(manager.finished).toBe(false);

		manager.disableRenderMode();
		manager.seekToTime(0);
		manager.next();
		expect(manager.finished).toBe(true);
	});
});
