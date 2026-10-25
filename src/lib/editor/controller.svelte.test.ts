import { describe, expect, it } from 'vitest';
import { EditorController } from './controller.svelte.js';
import { setMeasured } from './measure.js';
import SteppedScene from '../components/fixtures/SteppedScene.svelte';
import type { SceneEntry, Sequence } from '../scene/runtime/sequence.js';
import type { SceneManager, SceneTimeline } from '../scene/runtime/runtime.svelte.js';

/** The rate these tests measure at, so the cache key is real. */
const FPS = 60;

/** A scene of a known length, so a fit can be predicted exactly. */
function measured(seconds: number): SceneTimeline {
	return {
		enterDuration: 0.4,
		introHold: 0,
		steps: [{ duration: seconds - 0.4, wait: 0 }],
		totalDuration: seconds
	};
}

function sequence(...ids: string[]): Sequence {
	return ids.map((id, index) => ({
		id,
		order: index + 1,
		component: () => Promise.resolve({ default: SteppedScene })
	})) satisfies SceneEntry[];
}

describe('EditorController zoom', () => {
	it('fits the whole presentation until a zoom is chosen by hand', () => {
		const controller = new EditorController(sequence('fit-a', 'fit-b'), FPS);
		controller.viewportWidth = 400;
		// nothing is measured yet, so there is nothing to fit
		expect(controller.pps).toBe(240);

		setMeasured('fit-a', FPS, measured(2));
		controller.refitIfAuto();
		expect(controller.pps).toBeCloseTo(200);

		setMeasured('fit-b', FPS, measured(2));
		controller.refitIfAuto();
		expect(controller.pps).toBeCloseTo(100);

		controller.zoomIn();
		const zoomed = controller.pps;
		expect(zoomed).toBeGreaterThan(100);
		controller.refitIfAuto();
		expect(controller.pps).toBe(zoomed);

		controller.zoomToFit();
		expect(controller.pps).toBeCloseTo(100);
	});

	it('zooms out below the fit instead of being stuck at it', () => {
		const controller = new EditorController(sequence('out-a'), FPS);
		setMeasured('out-a', FPS, measured(2));

		controller.viewportWidth = 400;
		// the fit already fills the viewport, which used to be the floor
		expect(controller.pps).toBeCloseTo(200);

		controller.zoomOut();
		expect(controller.pps).toBeLessThan(200);
		expect(controller.pps).toBeCloseTo(200 / 1.4);
	});

	it('refits on a resize while the timeline still fits itself', () => {
		const controller = new EditorController(sequence('resize-a'), FPS);
		setMeasured('resize-a', FPS, measured(2));

		controller.viewportWidth = 400;
		expect(controller.pps).toBeCloseTo(200);

		controller.viewportWidth = 600;
		expect(controller.pps).toBeCloseTo(300);
	});

	it('fits a long presentation even below the fallback zoom', () => {
		const controller = new EditorController(sequence('fit-long'), FPS);
		setMeasured('fit-long', FPS, measured(80));

		controller.viewportWidth = 400;
		expect(controller.pps).toBeCloseTo(5);
		expect(controller.contentWidth).toBeCloseTo(400);
	});
});

describe('EditorController frame rate', () => {
	it('reads a block measured at its own rate', () => {
		const controller = new EditorController(sequence('rate-a'), FPS);
		setMeasured('rate-a', FPS, measured(2));

		expect(controller.total).toBeCloseTo(2);

		controller.setFps(30);
		// nothing is measured at 30 yet, so the block has no length
		expect(controller.total).toBeCloseTo(0);

		setMeasured('rate-a', 30, measured(2));
		expect(controller.total).toBeCloseTo(2);
	});

	it('regrids the snapping when the rate changes', () => {
		const controller = new EditorController(sequence('grid-a'), FPS);
		setMeasured('grid-a', FPS, measured(2));

		controller.setFps(30);
		setMeasured('grid-a', 30, measured(2));
		expect(controller.frameDuration).toBeCloseTo(1 / 30);
		// a time inside the first frame snaps to the start, past its middle to the next
		expect(controller.snap(0.01)).toBeCloseTo(0);
		expect(controller.snap(0.025)).toBeCloseTo(1 / 30);
	});
});

/**
 * Records the calls the controller makes, so a test can prove the order a
 * scene is positioned in. Only the methods the controller touches exist.
 */
function fakeManager(timeline: SceneTimeline) {
	const calls: string[] = [];
	const manager = {
		loaded: true,
		finished: false,
		enterDuration: timeline.enterDuration,
		exitDuration: 0,
		timeline,
		setEnterProgress(progress: number) {
			calls.push(`enter:${progress}`);
		},
		seekToTime(seconds: number) {
			calls.push(`seek:${seconds}`);
		},
		play() {
			calls.push('play');
		},
		advanceFrame() {
			return { done: false };
		},
		next() {},
		setExitProgress() {}
	};
	return { manager: manager as unknown as SceneManager, calls };
}

describe('EditorController scene positioning', () => {
	it('rewinds the steps before driving an enter, so a seek and a play agree', () => {
		const controller = new EditorController(sequence('enter-a'), FPS);
		setMeasured('enter-a', FPS, measured(2));
		const { manager, calls } = fakeManager(measured(2));
		controller.attach('enter-a', manager);

		calls.length = 0;
		// 0.2s sits inside the 0.4s enter, so the scene must rest at its first step
		controller.seek(0.2);

		expect(calls).toEqual(['seek:0', 'enter:0.5']);
	});

	it('rewinds the scene when the playhead wraps from the end to the start', () => {
		const controller = new EditorController(sequence('wrap-a'), FPS);
		setMeasured('wrap-a', FPS, measured(2));
		const { manager, calls } = fakeManager(measured(2));
		controller.attach('wrap-a', manager);
		controller.seek(2);

		calls.length = 0;
		controller.play();
		controller.pause();

		expect(calls).toContain('seek:0');
	});
});
