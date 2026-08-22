import { describe, expect, it, vi } from 'vitest';
import { SceneManager, type TransitionBuild } from './runtime.svelte';
import { ParallelStep, TickStep, TweenStep, type Step, type TickFrame } from './steps';

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

describe('SceneManager + waits', () => {
	it('a wait keeps the finished step on screen for its full duration in render mode', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();

		const state = { x: 0 };
		const step: Step = new TweenStep(state, 'x', 100, 0.5);
		step.wait = 0.5;
		manager.load({ steps: [step] });

		manager.next();
		manager.advanceFrame(0.25);
		expect(state.x).toBeLessThan(100);
		expect(manager.stepProgress).toBeGreaterThan(0);

		manager.advanceFrame(0.25);
		expect(state.x).toBe(100);
		expect(manager.stepProgress).toBe(1);
		expect(manager.finished).toBe(false);

		// progress stays pinned at 1 while the wait plays out
		manager.advanceFrame(0.25);
		expect(manager.stepProgress).toBe(1);
		expect(manager.finished).toBe(false);

		manager.advanceFrame(0.25);
		expect(manager.finished).toBe(true);
	});

	it('live playback skips waits entirely', () => {
		const manager = new SceneManager();
		const beat: Step = new TickStep(() => {}, 0);
		beat.wait = 10;
		manager.load({ steps: [beat] });

		manager.next();

		expect(manager.finished).toBe(true);
	});

	it('a wait before the first step holds the first frame until it begins', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();

		const frames: TickFrame[] = [];
		manager.load({
			steps: [new TickStep((f) => frames.push(f), 0.5)],
			holdBeforeFirstStep: 0.5
		});

		manager.next();
		manager.advanceFrame(0.25);
		// the first frame is still up, the animation has not begun
		expect(frames.at(-1)!.time).toBe(0);
		expect(manager.finished).toBe(false);

		manager.advanceFrame(0.75);
		expect(frames.at(-1)!.time).toBeCloseTo(0.5);
		expect(manager.finished).toBe(true);
	});

	it('a parallel step lasts as long as its slowest child, waits included', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();

		const state = { x: 0 };
		const child: Step = new TweenStep(state, 'x', 100, 1);
		child.wait = 0.5;
		manager.load({ steps: [new ParallelStep([child])] });

		manager.next();
		manager.advanceFrame(1);
		expect(state.x).toBe(100);
		expect(manager.finished).toBe(false);

		manager.advanceFrame(0.5);
		expect(manager.finished).toBe(true);
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
	it('starts the first step only when it is played', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();

		const step = new SpyStep();
		manager.load({ steps: [step] });

		expect(step.starts).toBe(0);
		expect(step.reverts).toBe(0);

		manager.next();
		expect(step.starts).toBe(1);

		manager.advanceFrame(0.5);
		expect(step.starts).toBe(1);

		manager.prev();
		expect(step.reverts).toBe(1);

		manager.next();
		expect(step.starts).toBe(2);
	});

	it('starts the first step via play() when resumed in place', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();

		const step = new SpyStep();
		manager.load({ steps: [step] });

		manager.play();
		expect(step.starts).toBe(1);
	});
});

describe('SceneManager deferred start vs rewind/seek', () => {
	it('prev immediately after load preserves the initial tween value', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		const state: Record<string, unknown> = { x: 5 };
		manager.load({ steps: [new TweenStep(state, 'x', 10, 1)] });

		// The step was never started, so reverting it must not clobber the
		// initial value with the un-snapshotted `from` default.
		manager.prev();
		expect(state.x).toBe(5);

		manager.next();
		let guard = 0;
		while (!manager.finished && guard++ < 100) manager.advanceFrame(0.2);
		expect(state.x).toBe(10);
	});

	it('seek on a freshly loaded scene does not corrupt the initial value', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		const state: Record<string, unknown> = { x: 5 };
		manager.load({ steps: [new TweenStep(state, 'x', 10, 1)] });

		manager.seek(0, false, false);
		expect(state.x).toBe(5);
	});

	it('seek enters the target step eagerly (unlike the load deferral)', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		const step = new SpyStep();
		manager.load({ steps: [step] });
		expect(step.starts).toBe(0);

		manager.seek(0, false, false);
		expect(step.starts).toBe(1);
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

describe('SceneManager stall timers', () => {
	it('completes a transition when the animation frame never fires', async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn(() => 1)
		);
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		try {
			const manager = new SceneManager();
			const exitBuild: TransitionBuild = (builder) => builder.tween('opacity', 0, 0.5);

			manager.load({ steps: [new SpyStep()], exitBuild });
			const exit = manager.playExit();
			expect(manager.transitionActive).toBe(true);

			await vi.advanceTimersByTimeAsync(150);
			expect(manager.transitionActive).toBe(false);

			await exit;
			expect(manager.exitBusy).toBe(false);
			expect(manager.transitionState.opacity).toBe(0);
		} finally {
			vi.unstubAllGlobals();
			vi.useRealTimers();
		}
	});

	it('does not force-complete a transition the animation frame finishes', async () => {
		vi.useFakeTimers();
		const capture: { frame: ((now: number) => void) | null } = { frame: null };
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn((callback: (now: number) => void) => {
				capture.frame = callback;
				return 1;
			})
		);
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		try {
			const manager = new SceneManager();
			const exitBuild: TransitionBuild = (builder) => builder.tween('opacity', 0, 0.5);

			manager.load({ steps: [new SpyStep()], exitBuild });
			const exit = manager.playExit();

			capture.frame?.(500);
			await exit;
			expect(manager.exitBusy).toBe(false);
			expect(manager.transitionActive).toBe(false);

			await vi.advanceTimersByTimeAsync(1000);
			expect(manager.transitionActive).toBe(false);
			expect(manager.transitionState.opacity).toBe(0);
		} finally {
			vi.unstubAllGlobals();
			vi.useRealTimers();
		}
	});

	it('completes a transition when the animation frame stalls after the first frame', async () => {
		vi.useFakeTimers();
		const capture: { frame: ((now: number) => void) | null } = { frame: null };
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn((callback: (now: number) => void) => {
				capture.frame = callback;
				return 1;
			})
		);
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		try {
			const manager = new SceneManager();
			const exitBuild: TransitionBuild = (builder) => builder.tween('opacity', 0, 0.5);

			manager.load({ steps: [new SpyStep()], exitBuild });
			const exit = manager.playExit();

			capture.frame?.(100);
			expect(manager.transitionActive).toBe(true);

			await vi.advanceTimersByTimeAsync(500 + 100);
			expect(manager.transitionActive).toBe(false);

			await exit;
			expect(manager.exitBusy).toBe(false);
			expect(manager.transitionState.opacity).toBe(0);
		} finally {
			vi.unstubAllGlobals();
			vi.useRealTimers();
		}
	});

	it('completes a step on its own when the animation frame never fires', async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn(() => 1)
		);
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		try {
			const manager = new SceneManager();
			manager.load({ steps: [new SpyStep(), new SpyStep()] });

			manager.next();
			expect(manager.stepCompleted).toBe(false);

			await vi.advanceTimersByTimeAsync(1000 + 50);
			expect(manager.stepCompleted).toBe(true);
			expect(manager.currentStep).toBe(1);
			expect(manager.finished).toBe(false);
		} finally {
			vi.unstubAllGlobals();
			vi.useRealTimers();
		}
	});

	it('completes a step when the animation frame stalls after the first frame', async () => {
		vi.useFakeTimers();
		const capture: { frame: ((now: number) => void) | null } = { frame: null };
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn((callback: (now: number) => void) => {
				capture.frame = callback;
				return 1;
			})
		);
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		try {
			const manager = new SceneManager();
			manager.load({ steps: [new SpyStep(), new SpyStep()] });

			manager.next();
			capture.frame?.(250);
			expect(manager.stepCompleted).toBe(false);

			await vi.advanceTimersByTimeAsync(1000 + 50);
			expect(manager.stepCompleted).toBe(true);
			expect(manager.currentStep).toBe(1);
		} finally {
			vi.unstubAllGlobals();
			vi.useRealTimers();
		}
	});
});

describe('SceneManager finished step-change', () => {
	it('emits a step change when the final step finishes', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();

		const changes: Array<{ step: number; total: number }> = [];
		manager.onStepChange((step, total) => changes.push({ step, total }));

		manager.load({ steps: [new SpyStep()] });

		manager.next();
		let guard = 0;
		while (!manager.finished && guard++ < 100) {
			manager.advanceFrame(0.1);
		}

		expect(manager.finished).toBe(true);
		// Emits: load (step 0), animation start (step 0, playing), finish (step 1).
		expect(changes).toEqual([
			{ step: 0, total: 1 },
			{ step: 0, total: 1 },
			{ step: 1, total: 1 }
		]);
	});
});

describe('SceneManager playing state', () => {
	it('reports playing while a step animates and stops when it completes', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		manager.load({ steps: [new SpyStep(), new SpyStep()] });

		expect(manager.playing).toBe(false);

		manager.next();
		expect(manager.playing).toBe(true);

		manager.advanceFrame(1);
		expect(manager.playing).toBe(false);
		expect(manager.stepCompleted).toBe(true);
	});

	it('plays the current step in place via play() without advancing', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		const step = new SpyStep();
		manager.load({ steps: [step] });

		manager.play();
		expect(manager.playing).toBe(true);

		manager.advanceFrame(1);
		expect(step.ends).toBe(1);
		expect(manager.step).toBe(0);
	});
});

describe('SceneManager seek', () => {
	function loaded() {
		const manager = new SceneManager();
		manager.enableRenderMode();
		const steps = [new SpyStep(), new SpyStep(), new SpyStep()];
		manager.load({ steps });
		return { manager, steps };
	}

	it('positions the loaded scene at a step without animating or replaying the entrance', () => {
		const { manager } = loaded();

		manager.seek(1);

		expect(manager.step).toBe(1);
		expect(manager.finished).toBe(false);
		expect(manager.isAnimating).toBe(false);
		expect(manager.transitionState.opacity).toBe(1);
	});

	it('emits a step change and reaches the finished phase on the last step', () => {
		const { manager } = loaded();

		const changes: Array<{ step: number; total: number }> = [];
		manager.onStepChange((step, total) => changes.push({ step, total }));

		manager.seek(2, false, true);

		expect(manager.finished).toBe(true);
		expect(manager.step).toBe(2);
		expect(changes).toContainEqual({ step: 3, total: 3 });
	});

	it('marks the current step as completed without advancing the next step', () => {
		const { manager } = loaded();

		manager.seek(1, true, false);

		expect(manager.step).toBe(1);
		expect(manager.stepCompleted).toBe(true);
		expect(manager.finished).toBe(false);
		expect(manager.isAnimating).toBe(false);
	});

	it('leaves the manager at the start when seeking step 0', () => {
		const { manager } = loaded();

		manager.seek(0);

		expect(manager.step).toBe(0);
		expect(manager.finished).toBe(false);
	});

	it('reverts steps in reverse when seeking backwards', () => {
		const { manager, steps } = loaded();

		manager.seek(2, false, true);
		const revertsAfterFinish = steps.map((s) => s.reverts);

		manager.seek(0);

		expect(manager.step).toBe(0);
		expect(manager.finished).toBe(false);
		expect(steps.map((s) => s.reverts)).toEqual([
			revertsAfterFinish[0] + 1,
			revertsAfterFinish[1] + 1,
			revertsAfterFinish[2] + 1
		]);
	});
});

describe('SceneManager stepProgress', () => {
	it('ramps 0→1 through a step and resets to 0 on advance', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		manager.load({ steps: [new TickStep(() => {}, 1), new TickStep(() => {}, 1)] });

		expect(manager.stepProgress).toBe(0);

		manager.next();
		manager.advanceFrame(0.5);
		expect(manager.stepProgress).toBeGreaterThan(0);
		expect(manager.stepProgress).toBeLessThan(1);

		let guard = 0;
		while (!manager.finished && guard++ < 100) {
			manager.advanceFrame(0.1);
		}
		expect(manager.stepProgress).toBe(1);
		expect(manager.step).toBe(0);

		manager.next();
		expect(manager.stepProgress).toBe(0);
		expect(manager.step).toBe(1);
	});

	it('returns to 1 on prev of a completed step and 0 when rewound to the start', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		manager.load({ steps: [new TickStep(() => {}, 1), new TickStep(() => {}, 1)] });

		manager.next();
		let guard = 0;
		while (!manager.finished && guard++ < 100) {
			manager.advanceFrame(0.1);
		}

		manager.next();
		expect(manager.stepProgress).toBe(0);

		manager.advanceFrame(1);
		expect(manager.stepProgress).toBe(1);

		manager.prev();
		expect(manager.step).toBe(0);
		expect(manager.stepProgress).toBe(1);

		manager.prev();
		expect(manager.step).toBe(0);
		expect(manager.stepCompleted).toBe(false);
		expect(manager.stepProgress).toBe(0);
	});

	it('lands on the right progress after seek', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		manager.load({
			steps: [new TickStep(() => {}, 1), new TickStep(() => {}, 1), new TickStep(() => {}, 1)]
		});

		manager.seek(1, true);
		expect(manager.step).toBe(1);
		expect(manager.stepProgress).toBe(1);

		manager.seek(0);
		expect(manager.step).toBe(0);
		expect(manager.stepProgress).toBe(0);
	});
});

describe('SceneManager zero-duration steps', () => {
	it('completes a zero-duration first step on the first next', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		manager.load({ steps: [new TickStep(() => {}, 0)] });

		manager.next();

		expect(manager.stepCompleted).toBe(true);
		expect(manager.finished).toBe(true);
		expect(manager.stepProgress).toBe(1);
	});

	it('completes a zero-duration step in place after a played step', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		manager.load({
			steps: [new TickStep(() => {}, 1), new TickStep(() => {}, 0), new TickStep(() => {}, 1)]
		});

		manager.next();
		manager.advanceFrame(1);
		expect(manager.stepCompleted).toBe(true);
		expect(manager.step).toBe(0);

		manager.next();
		expect(manager.step).toBe(1);
		expect(manager.stepCompleted).toBe(true);
		expect(manager.stepProgress).toBe(1);
		expect(manager.finished).toBe(false);

		manager.next();
		expect(manager.step).toBe(2);
		expect(manager.stepCompleted).toBe(false);
	});

	it('lands a zero-duration tween exactly on its target without frames', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();
		const state = { x: 0 };
		manager.load({ steps: [new TweenStep(state, 'x', 100, 0)] });

		manager.next();

		expect(state.x).toBe(100);
		expect(manager.stepCompleted).toBe(true);
	});

	it('rejects negative step durations', () => {
		expect(() => new TickStep(() => {}, -1)).toThrow(/duration/i);
		expect(() => new TweenStep({}, 'x', 1, -1)).toThrow(/duration/i);
	});
});

describe('SceneManager empty scene', () => {
	it('reports the scene as finished with full progress after load and seek', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();

		manager.load({ steps: [] });
		expect(manager.finished).toBe(true);
		expect(manager.stepProgress).toBe(1);

		manager.seek(0);
		expect(manager.finished).toBe(true);
		expect(manager.stepProgress).toBe(1);
	});
});
