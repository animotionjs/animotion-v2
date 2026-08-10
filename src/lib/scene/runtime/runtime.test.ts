import { describe, expect, it, vi } from 'vitest';
import { SceneManager, type TransitionBuild } from './runtime.svelte';
import { TickStep, type Step, type TickFrame } from './steps';

class SpyStep implements Step {
	starts = 0;
	reverts = 0;
	ends = 0;
	duration = 1;
	start() {
		this.starts++;
	}
	setProgress(p: number) {
		void p;
	}
	end() {
		this.ends++;
	}
	revert() {
		this.reverts++;
	}
}

describe('SceneManager + TickStep (render mode)', () => {
	it('plays a tick step deterministically via advanceFrame', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();

		const frames: TickFrame[] = [];
		manager.load({ steps: [new TickStep((frame) => frames.push(frame), 1)] });

		manager.next();
		let guard = 0;
		while (!manager.finished && guard++ < 100) {
			manager.advanceFrame(0.1);
		}

		expect(guard).toBeLessThan(100);
		expect(frames.length).toBeGreaterThan(0);
		expect(frames.at(-1)!.time).toBe(1);
		expect(frames.at(-1)!.progress).toBe(1);
		expect(manager.step).toBe(0);
	});
});

describe('SceneManager determinism for time slicing', () => {
	it('reproduces identical tick frames across fresh drives', () => {
		const drive = () => {
			const manager = new SceneManager();
			manager.enableRenderMode();
			const frames: TickFrame[] = [];
			manager.load({ steps: [new TickStep((f) => frames.push(f), 1)] });
			manager.next();
			let guard = 0;
			while (!manager.finished && guard++ < 100) {
				manager.advanceFrame(1 / 60);
			}
			expect(guard).toBeLessThan(100);
			return frames.map((f) => `${f.progress}|${f.time}|${f.frame}`);
		};

		// Each slice runs in a fresh page, so the whole drive must be a pure
		// function of the step + advance calls (no accumulated state leaking
		// across drives, no real time / randomness).
		expect(drive()).toEqual(drive());
		expect(drive().length).toBeGreaterThan(0);
	});
});

describe('SceneManager resume after prev', () => {
	it('restarts the current step when resuming after prev', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();

		const step = new SpyStep();
		manager.load({ steps: [step] });

		expect(step.starts).toBe(1);
		expect(step.reverts).toBe(0);

		manager.next();
		manager.advanceFrame(0.5);
		expect(step.starts).toBe(1);

		manager.prev();
		expect(step.reverts).toBe(1);

		manager.next();
		expect(step.starts).toBe(2);
	});
});

describe('SceneManager saved states', () => {
	it('getSavedState returns undefined before any save', () => {
		const manager = new SceneManager();
		expect(manager.getSavedState('intro')).toBeUndefined();
	});

	it('getSavedState returns the state recorded by saveState', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		manager.load({ steps: [new SpyStep(), new SpyStep()] });

		manager.next();
		manager.advanceFrame(1);
		manager.saveState('intro');

		expect(manager.getSavedState('intro')).toEqual({ stepIndex: 0, stepCompleted: true });
	});

	it('restoreState resumes a scene paused after the given steps', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		const steps = [new SpyStep(), new SpyStep(), new SpyStep(), new SpyStep()];

		manager.restoreState('intro', 2);
		manager.load({ steps, id: 'intro' });

		expect(manager.step).toBe(1);
		expect(manager.currentStep).toBe(2);
		expect(manager.totalSteps).toBe(4);
		expect(manager.finished).toBe(false);
		expect(steps[0].ends).toBe(1);
		expect(steps[1].ends).toBe(1);
		expect(steps[2].starts).toBe(0);
		expect(steps[2].ends).toBe(0);
	});

	it('goes back one step with a single prev after resuming', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		const steps = [new SpyStep(), new SpyStep(), new SpyStep()];

		manager.restoreState('code', 2);
		manager.load({ steps, id: 'code' });
		expect(manager.currentStep).toBe(2);

		manager.prev();

		expect(manager.currentStep).toBe(1);
		expect(steps[1].reverts).toBe(1);
	});

	it('restoreState clamps out-of-range steps to the last step', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		const steps = [new SpyStep(), new SpyStep(), new SpyStep()];

		manager.restoreState('intro', 99);
		manager.load({ steps, id: 'intro' });

		expect(manager.step).toBe(2);
		expect(manager.finished).toBe(true);
		expect(steps[0].ends).toBe(1);
		expect(steps[1].ends).toBe(1);
		expect(steps[2].ends).toBe(1);
	});
});

describe('SceneManager currentStep', () => {
	it('counts a completed step as the next step', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		manager.load({ steps: [new SpyStep(), new SpyStep()] });

		expect(manager.currentStep).toBe(0);

		manager.next();
		manager.advanceFrame(1);

		expect(manager.currentStep).toBe(1);
	});
});

describe('SceneManager step-change events', () => {
	it('emits the effective step when a step completes', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		const events: Array<[number, number]> = [];
		manager.onStepChange((step, total) => events.push([step, total]));

		manager.load({ steps: [new SpyStep(), new SpyStep()] });
		manager.next();
		manager.advanceFrame(1);

		expect(events).toContainEqual([1, 2]);
	});

	it('emits step 0 when rewinding a completed first step', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		const events: Array<[number, number]> = [];
		manager.onStepChange((step, total) => events.push([step, total]));

		manager.load({ steps: [new SpyStep(), new SpyStep()] });
		manager.next();
		manager.advanceFrame(1);
		manager.prev();

		expect(events.at(-1)).toEqual([0, 2]);
		expect(manager.currentStep).toBe(0);
	});
});

describe('SceneManager enter transition', () => {
	it('skips the enter transition on the first load and plays it on later loads', () => {
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn(() => 1)
		);
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		try {
			const manager = new SceneManager();
			const enterBuild: TransitionBuild = (builder) => builder.tween('opacity', 1, 0.5);

			manager.load({ steps: [new SpyStep()], enterBuild });
			expect(manager.transitionActive).toBe(false);

			manager.load({ steps: [new SpyStep()], enterBuild });
			expect(manager.transitionActive).toBe(true);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
