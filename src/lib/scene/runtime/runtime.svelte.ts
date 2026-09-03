import { flushSync } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { TweenStep, ParallelStep, type Step } from './steps';
import { RealTimeScheduler, RenderScheduler, type FrameScheduler } from './scheduler';
import { clamp, easeInOut, type Easing } from '../easing';

/** Which way the user is moving through the presentation. */
export type Direction = 'forward' | 'backward';

/** Timing of one step on the video timeline covering its animation and wait tail. */
export interface TimelineStep {
	/** Seconds the step's animation runs for. */
	duration: number;
	/** Extra seconds the finished frame stays up (`wait`); `0` when unset. */
	wait: number;
}

/**
 * The scene's timing as the video renderer lays it out. An enter transition,
 * an optional hold before the first step, then per-step spans of
 * `duration + wait`. This is what a scrubber draws and seeks against.
 */
export interface SceneTimeline {
	/** Seconds the enter transition occupies; `0` when the scene has none. */
	enterDuration: number;
	/** Seconds the first frame is held before the first step begins. */
	introHold: number;
	/** Per-step spans, in play order. */
	steps: TimelineStep[];
	/** Total seconds across the enter, intro hold and every step span. */
	totalDuration: number;
}

/** One laid out span on the video timeline, either the enter transition or a step. */
export interface TimelineSegment {
	/** Seconds from the timeline start where the segment begins. */
	start: number;
	/** Seconds the first frame is held before the step's animation starts, always 0 for the enter transition. */
	hold: number;
	/** Seconds the animation runs for. */
	duration: number;
	/** Extra seconds the finished frame stays up. */
	wait: number;
	/** Whether this is the enter transition rather than a step. */
	enter: boolean;
}

/**
 * Lays out the enter transition and every step span in play order. Shared by
 * the scrubber, the segment jumps and {@link SceneManager.seekToTime}, so all
 * three agree on where one segment ends and the next begins.
 */
export function timelineSegments(timeline: SceneTimeline): TimelineSegment[] {
	const segments: TimelineSegment[] = [];
	let cursor = 0;
	if (timeline.enterDuration > 0) {
		segments.push({ start: 0, hold: 0, duration: timeline.enterDuration, wait: 0, enter: true });
		cursor = timeline.enterDuration;
	}
	timeline.steps.forEach((step, index) => {
		const hold = index === 0 ? timeline.introHold : 0;
		segments.push({
			start: cursor,
			hold,
			duration: step.duration,
			wait: step.wait,
			enter: false
		});
		cursor += hold + step.duration + step.wait;
	});
	return segments;
}

type SavedState = {
	stepIndex: number;
	stepCompleted: boolean;
};

/**
 * Builds a scene transition by setting and tweening the transition state
 * (`opacity`, `x`, `y`, `scale`); multiple tweens run in parallel.
 */
export type TransitionBuild = (builder: TransitionBuilder, direction: Direction) => void;

/** Accumulates the steps and immediate sets of a scene transition. */
export class TransitionBuilder {
	#state: Record<string, number>;
	#steps: Step[] = [];

	constructor(state: Record<string, number>) {
		this.#state = state;
	}

	/** Sets a value immediately on the transition state; tweens added after it animate from the current value. */
	set(key: string, value: number) {
		this.#state[key] = value;
	}

	/** Tweens a value to `to` over `duration` seconds with the given easing. */
	tween(key: string, to: number, duration = 0.5, ease: Easing = easeInOut) {
		this.#steps.push(new TweenStep(this.#state, key, to, duration, ease));
		return this;
	}

	/** Returns the accumulated tween steps. */
	getSteps() {
		return this.#steps;
	}
}

/**
 * Drives a scene's steps and transitions. One manager per presentation; it is
 * created by `<Scenes>` and exposed via {@link getSceneManager}.
 */
export class SceneManager {
	/*
	 * Rests at paused until the first scene loads, so a manager with nothing
	 * loaded reports zero progress and is not mistaken for a finished one.
	 */
	#phase: 'paused' | 'tweening' | 'finished' = $state('paused');
	#stepIndex = $state(0);
	#totalSteps = $state(0);
	/**
	 * Changes whenever a scene loads. Most timing fields are plain values, so
	 * without this the timeline getter would have nothing reactive to watch
	 * and enter-only scenes would never refresh.
	 */
	#loadVersion = $state(0);
	#steps: Step[] = [];
	#elapsed = 0;
	#stepProgress = $state(0);
	#stepCompleted = $state(false);
	#needsStart = false;
	#rafId: number | null = null;
	#transitionRafId: number | null = null;
	#stepStall: ReturnType<typeof setTimeout> | null = null;
	#transitionStall: ReturnType<typeof setTimeout> | null = null;
	#transitionDeadline: ReturnType<typeof setTimeout> | null = null;
	#lastFrame = 0;
	#transitionLastFrame = 0;
	#transitionElapsed = 0;
	#holdBeforeFirstStep = 0;
	#savedStates = new SvelteMap<string, SavedState>();

	#transitionState = $state({ opacity: 1, x: 0, y: 0, scale: 1 });
	#direction: Direction = 'forward';
	#scheduler: FrameScheduler = new RealTimeScheduler();
	#renderMode = false;
	#enterBuild: TransitionBuild | null = null;
	#exitBuild: TransitionBuild | null = null;
	#exitBusy = false;
	#firstLoad = true;

	#stepChangeListeners = new SvelteSet<(step: number, total: number) => void>();

	/** Subscribes to step changes; returns an unsubscribe function. */
	onStepChange(listener: (step: number, total: number) => void) {
		this.#stepChangeListeners.add(listener);
		return () => this.#stepChangeListeners.delete(listener);
	}

	#emitStepChange() {
		for (const listener of this.#stepChangeListeners) {
			listener(this.currentStep, this.#totalSteps);
		}
	}

	/** Whether all steps have completed. */
	get finished() {
		return this.#phase === 'finished';
	}

	/** Whether any scene has loaded since the manager was created. */
	get loaded() {
		return this.#loadVersion > 0;
	}

	/** The 0-based index of the current step. */
	get step() {
		return this.#stepIndex;
	}

	/**
	 * The step the user is currently on: a completed step counts as the next
	 * one, so a scene with the first step played reports `1`.
	 */
	get currentStep() {
		return this.#stepCompleted ? this.#stepIndex + 1 : this.#stepIndex;
	}

	/** Total number of steps in the loaded scene. */
	get totalSteps() {
		return this.#totalSteps;
	}

	/** Whether the current step's animation has fully played. */
	get stepCompleted() {
		return this.#stepCompleted;
	}

	/** Whether the current step's animation is playing. */
	get playing() {
		return this.#phase === 'tweening';
	}

	/** Whether the scene is at its first step with nothing played yet. */
	get atStart() {
		return this.#stepIndex === 0 && !this.#stepCompleted;
	}

	/** Overall progress through the scene as a fraction of total steps. */
	get completion() {
		if (this.#phase === 'finished') return 1;
		if (this.#totalSteps === 0) return 0;
		const done = this.#phase !== 'paused' || this.#stepCompleted;
		return (this.#stepIndex + (done ? 1 : 0)) / this.totalSteps;
	}

	/** Progress 0..1 through the current step; 1 while paused on a completed step. */
	get stepProgress() {
		return this.#stepProgress;
	}

	/** Reactive transition state read by `<Scene>`: `opacity`, `x`, `y`, `scale`. */
	get transitionState() {
		return this.#transitionState;
	}

	/** The last direction set via {@link setDirection}. */
	get direction() {
		return this.#direction;
	}

	/** Current phase: `'paused'`, `'tweening'`, or `'finished'`. */
	get phase() {
		return this.#phase;
	}

	/** Whether a scene transition is currently animating. */
	get transitionActive() {
		return this.#transitionRafId !== null;
	}

	/** Whether a step or transition is currently animating. */
	get isAnimating() {
		return this.#phase === 'tweening' || this.#transitionRafId !== null;
	}

	/** Whether the exit transition is still playing. */
	get exitBusy() {
		return this.#exitBusy;
	}

	/** Sets the direction used by direction-aware transition builds. */
	setDirection(direction: Direction) {
		this.#direction = direction;
	}

	/** Sets the transition build used when the scene enters. */
	setEnterTransition(build: TransitionBuild | null) {
		this.#enterBuild = build;
	}

	/** Sets the transition build used when the scene exits. */
	setExitTransition(build: TransitionBuild | null) {
		this.#exitBuild = build;
	}

	/**
	 * Switches to deterministic, render-driven scheduling. Only used during
	 * video rendering; returns the scheduler to drive manually.
	 */
	enableRenderMode() {
		this.#stopLoop();
		this.#stopTransitionLoop();
		const render = new RenderScheduler();
		this.#scheduler = render;
		this.#rafId = null;
		this.#transitionRafId = null;
		this.#renderMode = true;
		return render;
	}

	/** Advances the render scheduler by `deltaSeconds` and reports whether the scene went idle. */
	advanceFrame(deltaSeconds: number) {
		const pending = (this.#scheduler as RenderScheduler).tick(deltaSeconds);
		return {
			done: pending === 0 && !this.transitionActive && !this.isAnimating
		};
	}

	/**
	 * Leaves deterministic render mode, returning to realtime scheduling for
	 * live playback. Pending render-scheduler frames are dropped; position the
	 * scene explicitly afterwards (e.g. via {@link seekToTime}).
	 */
	disableRenderMode() {
		this.#stopLoop();
		this.#stopTransitionLoop();
		this.#scheduler = new RealTimeScheduler();
		this.#renderMode = false;
	}

	/** Records the current step position under `id` for later {@link load}. */
	saveState(id: string) {
		this.#savedStates.set(id, {
			stepIndex: this.#stepIndex,
			stepCompleted: this.#stepCompleted
		});
	}

	/**
	 * Stores a step position under `id` without playing it. The next
	 * {@link load} for `id` fast-forwards the scene to that position. Used by
	 * the speaker view to render a scene at a specific step.
	 */
	setStepState(id: string, stepIndex: number, stepCompleted: boolean) {
		this.#savedStates.set(id, { stepIndex, stepCompleted });
	}

	/** Whether a state was saved for `id`. */
	hasSavedState(id: string) {
		return this.#savedStates.has(id);
	}

	/** Returns the saved state for `id`, or `undefined` if none was saved. */
	getSavedState(id: string) {
		return this.#savedStates.get(id);
	}

	/**
	 * Seeds the saved state for `id` to land paused on `step` (0-based). Used
	 * to resume from a URL hash before the scene loads; {@link load} fast-forwards
	 * to the step. Out-of-range steps are clamped by {@link load}.
	 */
	restoreState(id: string, step: number) {
		this.#savedStates.set(id, { stepIndex: step, stepCompleted: false });
	}

	/** The scene's timing laid out exactly as the video renderer plays it. */
	get timeline() {
		/*
		 * Reading the version keeps this getter reactive. Steps, holds and the
		 * enter duration are plain values that arrive with each load, and an
		 * enter-only scene leaves the step count unchanged.
		 */
		void this.#loadVersion;
		const count = this.#totalSteps;
		const steps = this.#steps
			.slice(0, count)
			.map((step) => ({ duration: step.duration, wait: step.wait ?? 0 }));
		const enterDuration = this.#enterDuration();
		const introHold = steps.length > 0 ? this.#holdBeforeFirstStep : 0;
		const body = steps.reduce((sum, step) => sum + step.duration + step.wait, 0);
		return {
			enterDuration,
			introHold,
			steps,
			totalDuration: enterDuration + introHold + body
		};
	}

	/**
	 * Measures the enter transition by dry-building it against a throwaway
	 * state; builds are pure descriptions, so nothing is animated. Parallel
	 * tweens overlap, so the transition lasts as long as its longest tween.
	 */
	#enterDuration() {
		if (!this.#enterBuild) return 0;
		const probe = new TransitionBuilder({});
		this.#enterBuild(probe, this.#direction);
		return Math.max(0, ...probe.getSteps().map((step) => step.duration));
	}

	/**
	 * Positions the loaded scene at an absolute point on its video timeline.
	 * Values inside the enter transition freeze it at the matching progress.
	 * Later values land inside their step, which may sit in its hold, its
	 * animation or its wait tail. Past the end finishes the scene.
	 *
	 * Previously started steps revert first and earlier ones replay in full,
	 * so layout snapshots and code diffs rebuild in play order and scrubbing
	 * backwards reaches exactly the state forward playback produced. Time
	 * spent in the entered step is remembered so {@link play} resumes there
	 * rather than restarting it.
	 */
	seekToTime(seconds: number) {
		this.#stopLoop();
		this.#stopTransitionLoop();

		const steps = this.#steps;
		this.#totalSteps = steps.length;

		if (steps.length === 0) {
			this.#phase = 'finished';
			this.#stepProgress = 1;
			this.#emitStepChange();
			this.#resetTransitionState();
			return;
		}

		const time = Math.max(0, seconds);
		const timeline = this.timeline;
		const { enterDuration } = timeline;

		/*
		 * Undo every started step so the replays below begin from pristine
		 * state. Unstarted steps guard themselves inside `revert()`.
		 */
		for (let i = this.#stepIndex; i >= 0; i--) {
			steps[i]?.revert();
		}

		const restAtStart = () => {
			this.#stepIndex = 0;
			this.#elapsed = 0;
			this.#stepProgress = 0;
			this.#stepCompleted = false;
			this.#needsStart = true;
			this.#phase = 'paused';
		};

		if (time <= 0) {
			restAtStart();
			this.#resetTransitionState();
			this.#emitStepChange();
			return;
		}

		if (time < enterDuration) {
			restAtStart();
			this.#applyTransitionAt(time / enterDuration);
			this.#emitStepChange();
			return;
		}

		const total = timeline.totalDuration;
		if (time >= total) {
			this.#positionTo(steps.length, false, true);
			this.#resetTransitionState();
			return;
		}

		/*
		 * Walk the laid out segments to find the step under the playhead. A
		 * boundary time lands on the later segment's start, which renders
		 * identically to the previous one's completed frame.
		 */
		const spans = timelineSegments(timeline).filter((segment) => !segment.enter);
		let target = spans.length - 1;
		for (let index = 0; index < spans.length; index++) {
			const segment = spans[index]!;
			if (time < segment.start + segment.hold + segment.duration + segment.wait) {
				target = index;
				break;
			}
		}

		for (let i = 0; i < target; i++) {
			const step = steps[i]!;
			step.start();
			step.setProgress(1);
			step.end();
		}

		const segment = spans[target]!;
		const step = steps[target]!;
		step.start();
		this.#needsStart = false;

		const local = time - segment.start;
		const fraction = step.duration > 0 ? clamp((local - segment.hold) / step.duration, 0, 1) : 1;
		step.setProgress(fraction);

		this.#stepIndex = target;
		this.#elapsed = local;
		this.#stepProgress = fraction;
		this.#stepCompleted = fraction >= 1;
		this.#phase = 'paused';
		this.#resetTransitionState();
		this.#emitStepChange();
	}

	/** Freezes the enter transition at `progress` (0..1) without ending it. */
	#applyTransitionAt(progress: number) {
		this.#resetTransitionState();
		if (!this.#enterBuild) return;
		const builder = new TransitionBuilder(this.#transitionState);
		this.#enterBuild(builder, this.#direction);
		const built = builder.getSteps();
		if (built.length === 0) return;
		const composite = built.length === 1 ? built[0]! : new ParallelStep(built);
		composite.start();
		composite.setProgress(clamp(progress, 0, 1));
	}

	/**
	 * Loads a scene's steps into the manager. If `id` has a saved state, the
	 * scene is fast-forwarded to that step. Used by `createScene` on mount.
	 */
	load({
		steps,
		id,
		holdBeforeFirstStep = 0,
		enterBuild,
		exitBuild
	}: {
		steps: Step[];
		id?: string;
		/** Seconds to keep the first frame up before the first step starts. */
		holdBeforeFirstStep?: number;
		enterBuild?: TransitionBuild | null;
		exitBuild?: TransitionBuild | null;
	}) {
		this.#softClear();
		this.#holdBeforeFirstStep = holdBeforeFirstStep;

		if (enterBuild) this.#enterBuild = enterBuild;
		if (exitBuild) this.#exitBuild = exitBuild;

		const saved = id ? this.#savedStates.get(id) : undefined;

		this.#steps = steps;
		this.#totalSteps = steps.length;

		if (steps.length === 0) {
			this.#phase = 'finished';
			this.#stepProgress = 1;
			this.#emitStepChange();
		} else {
			this.#stepIndex = 0;
			this.#elapsed = 0;
			this.#stepProgress = 0;
			this.#stepCompleted = false;

			let target = 0;
			if (saved) target = saved.stepCompleted ? saved.stepIndex + 1 : saved.stepIndex;
			while (this.#stepIndex < target) {
				const step = this.#steps[this.#stepIndex];
				if (!step) break;
				step.start();
				step.setProgress(1);
				step.end();
				this.#stepIndex++;
			}

			if (this.#stepIndex >= steps.length) {
				this.#stepIndex = steps.length - 1;
				this.#phase = 'finished';
				this.#stepCompleted = true;
				this.#stepProgress = 1;
			} else if (target > 0) {
				/*
				 * Steps 0..target-1 are complete, so pause between them and the next
				 * step, which is where normal playback ends up after a step
				 * finishes. This keeps `prev()` working when the resumed step is
				 * entered but unplayed.
				 */
				this.#stepIndex = target - 1;
				this.#stepCompleted = true;
				this.#phase = 'paused';
				this.#stepProgress = 1;
			} else {
				/*
				 * A fresh scene rests at its initial state; the first step starts
				 * on the first `next` (or a mirror's `play`). Starting it eagerly
				 * would show a layout step's mid-animation frame on load instead
				 * of the scene's true start.
				 */
				this.#needsStart = true;
				this.#phase = 'paused';
			}
		}

		this.#emitStepChange();
		this.#loadVersion++;

		/*
		 * The enter transition plays when navigating between scenes. On the
		 * first load of a page session it is skipped, so a reload jumps
		 * straight to the resumed step. Render mode always plays it: the
		 * renderer drives it explicitly and every render scene is a fresh-page
		 * first load.
		 */
		if (this.#enterBuild && (this.#renderMode || !this.#firstLoad)) {
			this.playEnter();
		} else {
			this.#resetTransitionState();
		}
		this.#firstLoad = false;
	}

	#softClear() {
		this.#stopLoop();
		this.#stopTransitionLoop();
		this.#currentStep()?.end();
		this.#steps = [];
		this.#enterBuild = null;
		this.#exitBuild = null;
		this.#exitBusy = false;
		this.#phase = 'finished';
		this.#stepIndex = 0;
		this.#totalSteps = 0;
		this.#elapsed = 0;
		this.#stepProgress = 0;
		this.#stepCompleted = false;
		this.#needsStart = false;
		this.#holdBeforeFirstStep = 0;
	}

	/**
	 * Positions the already-loaded scene at the given step without replaying
	 * the enter transition. `stepCompleted` marks the current step's animation
	 * as fully played without advancing to the next step; `finished` plays the
	 * whole scene to completion. Steps above the target are reverted first, so
	 * the scene regresses correctly. Used by the embedded speaker mirror to
	 * track the presentation in place.
	 *
	 * Unlike `load()`, the target step is entered eagerly (its `start()` runs
	 * immediately) rather than deferred: `seek` reproduces a playback position
	 * the presenter already reached, so the step's animation is meant to resume.
	 * The mirror only seeks when its own position differs (see
	 * `speaker.embedState`), so a freshly-loaded un-started scene is never
	 * flashed by entering step 0 here.
	 */
	seek(stepIndex: number, stepCompleted = false, finished = false) {
		this.#stopLoop();
		this.#stopTransitionLoop();
		this.#currentStep()?.end();

		const steps = this.#steps;
		this.#totalSteps = steps.length;

		if (steps.length === 0) {
			this.#phase = 'finished';
			this.#stepProgress = 1;
			this.#emitStepChange();
			this.#resetTransitionState();
			return;
		}

		const s = Math.max(0, Math.min(stepIndex, steps.length - 1));
		const target = finished || stepCompleted ? s + 1 : s;

		/*
		 * Undo every started step in reverse, removing the layout side-effects
		 * and state they applied, before replaying the position below. This is
		 * what lets the scene move backwards.
		 */
		for (let i = this.#stepIndex; i >= 0; i--) {
			steps[i]?.revert();
		}

		this.#positionTo(target, stepCompleted, finished);
		this.#resetTransitionState();
	}

	/**
	 * Reproduces a playback position in place: runs steps `0..target-1` to
	 * completion, then either enters the target step (started, not progressed),
	 * marks the previous step completed, or finishes the scene. Emits a step
	 * change afterwards. Used by {@link seek}.
	 *
	 * Entering the target step eagerly (`#enterStep`) is intentional and
	 * mirrors the contract `load()` deliberately breaks: `load` rests a fresh
	 * scene at its initial state, while a `seek`'d scene is being resumed, so
	 * its current step is started at once.
	 */
	#positionTo(target: number, stepCompleted: boolean, finished: boolean) {
		const steps = this.#steps;
		this.#stepIndex = 0;
		this.#elapsed = 0;
		this.#stepProgress = 0;
		this.#stepCompleted = false;

		for (let i = 0; i < target; i++) {
			const step = steps[i];
			if (!step) break;
			step.start();
			step.setProgress(1);
			step.end();
		}

		if (steps.length === 0) {
			this.#phase = 'finished';
			this.#stepProgress = 1;
		} else if (finished || target >= steps.length) {
			this.#stepIndex = steps.length - 1;
			this.#stepCompleted = true;
			this.#phase = 'finished';
			this.#stepProgress = 1;
		} else if (stepCompleted) {
			this.#stepIndex = target - 1;
			this.#stepCompleted = true;
			this.#phase = 'paused';
			this.#stepProgress = 1;
		} else {
			this.#stepIndex = target;
			this.#phase = 'paused';
			this.#enterStep(target);
		}

		this.#emitStepChange();
	}

	/** Stops all activity and unloads the current scene. */
	clear() {
		this.#softClear();
		this.#resetTransitionState();
	}

	/**
	 * Plays the enter transition and resolves when it completes. A
	 * `fromProgress` in 0..1 resumes mid-transition instead of restarting,
	 * matching a scrubbed playhead inside the enter segment.
	 */
	playEnter(fromProgress = 0) {
		return this.#playTransition(this.#enterBuild, fromProgress);
	}

	/**
	 * Plays the exit transition and resolves when it completes. The transition
	 * is given a deadline equal to its duration, so it resolves even when
	 * `requestAnimationFrame` never fires (e.g. a window on a non-active
	 * virtual desktop), which would otherwise block the navigation that awaits
	 * `playExit`.
	 */
	playExit() {
		const promise = this.#playTransition(this.#exitBuild);
		this.#exitBusy = true;
		promise.then(() => {
			this.#exitBusy = false;
		});
		return promise;
	}

	#resetTransitionState() {
		this.#stopTransitionLoop();
		this.#transitionState.opacity = 1;
		this.#transitionState.x = 0;
		this.#transitionState.y = 0;
		this.#transitionState.scale = 1;
	}

	#playTransition(buildFn: TransitionBuild | null, startProgress = 0) {
		return new Promise<void>((resolve) => {
			if (!buildFn) {
				this.#resetTransitionState();
				resolve();
				return;
			}

			this.#resetTransitionState();

			const builder = new TransitionBuilder(this.#transitionState);
			buildFn(builder, this.#direction);
			const steps = builder.getSteps();

			if (steps.length === 0) {
				resolve();
				return;
			}

			const composite = steps.length === 1 ? steps[0] : new ParallelStep(steps);
			this.#playStep(composite, resolve, startProgress * composite.duration);
		});
	}

	#playStep(step: Step, onComplete: () => void, startElapsed = 0) {
		this.#stopTransitionLoop();
		step.start();
		this.#transitionElapsed = startElapsed;
		this.#transitionLastFrame = this.#scheduler.now();
		if (startElapsed > 0) step.setProgress(Math.min(startElapsed / step.duration, 1));

		let done = false;
		const complete = () => {
			if (done) return;
			done = true;
			this.#clearTransitionStall();
			this.#clearTransitionDeadline();
			if (this.#transitionRafId !== null) {
				this.#scheduler.cancel(this.#transitionRafId);
				this.#transitionRafId = null;
			}
			step.setProgress(1);
			step.end();
			onComplete();
		};

		const frame = (now: number) => {
			this.#clearTransitionStall();
			const delta = (now - this.#transitionLastFrame) / 1000;
			this.#transitionLastFrame = now;

			this.#transitionElapsed += delta;
			const progress = this.#transitionElapsed / step.duration;
			step.setProgress(progress);
			if (this.#renderMode) flushSync();

			if (progress >= 1) {
				complete();
				return;
			}

			this.#transitionRafId = this.#scheduler.request(frame);
		};

		this.#transitionRafId = this.#scheduler.request(frame);

		/*
		 * Hidden windows never receive animation frames, so the tween could
		 * stall forever and block whoever awaits this promise. Two timers
		 * guard against that: a stall timer fires when no frame arrives at
		 * all, and a deadline fires when frames stop mid-transition. A visible
		 * window finishes the tween first and clears both. Render mode skips
		 * the timers because it drives frames itself.
		 */
		if (!this.#renderMode) {
			this.#transitionStall = setTimeout(() => {
				this.#transitionStall = null;
				complete();
			}, 150);
			this.#transitionDeadline = setTimeout(
				() => {
					this.#transitionDeadline = null;
					complete();
				},
				step.duration * 1000 + 100
			);
		}
	}

	#clearTransitionStall() {
		if (this.#transitionStall !== null) {
			clearTimeout(this.#transitionStall);
			this.#transitionStall = null;
		}
	}

	#clearTransitionDeadline() {
		if (this.#transitionDeadline !== null) {
			clearTimeout(this.#transitionDeadline);
			this.#transitionDeadline = null;
		}
	}

	#stopTransitionLoop() {
		this.#clearTransitionStall();
		this.#clearTransitionDeadline();
		if (this.#transitionRafId !== null) {
			this.#scheduler.cancel(this.#transitionRafId);
			this.#transitionRafId = null;
		}
	}

	/**
	 * Plays the current step's animation in place, without advancing. Used by
	 * the embedded speaker mirror to follow a presenter animating a step. Emits
	 * a step change so the playing state propagates.
	 */
	play() {
		if (this.#needsStart) {
			this.#needsStart = false;
			this.#enterStep(this.#stepIndex);
		}
		this.#playCurrent();
	}

	/** Advances to the next step, or fast-forwards the current tween. */
	next() {
		if (this.#phase === 'finished') return;

		if (this.#phase === 'tweening') {
			this.#stopLoop();
			this.#currentStep()?.setProgress(1);
			this.#currentStep()?.end();
			this.#stepCompleted = false;
			this.#advance();
			this.#playCurrent();
			return;
		}

		if (this.#stepCompleted) {
			this.#stepCompleted = false;
			this.#advance();
			this.#playCurrent();
		} else {
			if (this.#needsStart) {
				this.#needsStart = false;
				this.#enterStep(this.#stepIndex);
			}
			this.#playCurrent();
		}
	}

	/** Returns to the previous step, or rewinds the current one. */
	prev() {
		this.#stopLoop();
		this.#needsStart = true;

		if (this.#stepIndex >= this.#steps.length) {
			this.#stepIndex = this.#steps.length - 1;
			this.#currentStep()?.revert();
			this.#stepCompleted = true;
			this.#stepProgress = 1;
			this.#phase = 'paused';
			this.#emitStepChange();
			return;
		}

		this.#currentStep()?.revert();

		if (this.#stepIndex === 0) {
			this.#stepCompleted = false;
			this.#stepProgress = 0;
			this.#phase = 'paused';
			this.#emitStepChange();
			return;
		}

		this.#stepIndex--;
		this.#stepCompleted = true;
		this.#stepProgress = 1;
		this.#phase = 'paused';
		this.#emitStepChange();
	}

	#currentStep() {
		return this.#steps[this.#stepIndex];
	}
	/**
	 * Total seconds spent on `step`: its animation plus any waits after it.
	 * Live playback only spends the animation duration on each step.
	 */
	#totalFor(step: Step) {
		const before = this.#renderMode && this.#stepIndex === 0 ? this.#holdBeforeFirstStep : 0;
		const after = this.#renderMode ? (step.wait ?? 0) : 0;
		return step.duration + before + after;
	}

	#playCurrent() {
		const step = this.#currentStep();
		if (!step) return;

		if (this.#totalFor(step) <= 0) {
			step.setProgress(1);
			this.#completeStepTween(step);
			return;
		}

		this.#phase = 'tweening';
		this.#startLoop();
	}

	#enterStep(index: number) {
		const step = this.#steps[index];
		if (!step) return;
		this.#needsStart = false;

		step.start();
		this.#elapsed = 0;
		this.#stepProgress = 0;
		this.#stepCompleted = false;
		this.#phase = 'paused';
	}

	#advance() {
		this.#stepIndex++;
		this.#elapsed = 0;
		this.#stepCompleted = false;

		if (this.#stepIndex >= this.#steps.length) {
			this.#needsStart = false;
			this.#phase = 'finished';
			this.#stepProgress = 1;
			this.#emitStepChange();
			return;
		}

		this.#enterStep(this.#stepIndex);
		this.#emitStepChange();
	}

	#startLoop() {
		const step = this.#currentStep();
		if (!step) return;

		// a pause leaves the frame pending and resuming would drive the step twice per tick
		this.#stopLoop();

		this.#phase = 'tweening';
		this.#lastFrame = this.#scheduler.now();
		this.#emitStepChange();

		const before = this.#renderMode && this.#stepIndex === 0 ? this.#holdBeforeFirstStep : 0;
		const total = this.#totalFor(step);

		const frame = (now: number) => {
			const delta = (now - this.#lastFrame) / 1000;
			this.#lastFrame = now;

			this.#elapsed += delta;
			const animating = Math.min(Math.max(this.#elapsed - before, 0), step.duration);
			const progress = step.duration > 0 ? animating / step.duration : 1;
			this.#stepProgress = progress;
			step.setProgress(progress);
			if (this.#renderMode) flushSync();

			if (this.#elapsed >= total) {
				this.#completeStepTween(step);
				return;
			}

			if (this.#phase !== 'tweening') return;

			this.#rafId = this.#scheduler.request(frame);
		};

		this.#rafId = this.#scheduler.request(frame);

		/*
		 * Same protection as in `#playStep`: hidden windows get no frames, so
		 * a timer armed for slightly longer than the step completes it on its
		 * own, staying in sync with a visible mirror instead of waiting for an
		 * extra press to fast-forward. Render mode skips the timer.
		 */
		if (!this.#renderMode) {
			this.#stepStall = setTimeout(
				() => {
					this.#stepStall = null;
					if (this.#rafId !== null) {
						this.#scheduler.cancel(this.#rafId);
						this.#rafId = null;
						this.#completeStepTween(step);
					}
				},
				total * 1000 + 50
			);
		}
	}

	/** Finishes the current step's tween in place, as if its animation completed. */
	#completeStepTween(step: Step) {
		this.#clearStepStall();
		step.end();
		this.#stepCompleted = true;
		this.#stepProgress = 1;
		this.#rafId = null;
		if (this.#stepIndex >= this.#steps.length - 1) {
			this.#phase = 'finished';
		} else {
			this.#phase = 'paused';
		}
		this.#emitStepChange();
	}

	#clearStepStall() {
		if (this.#stepStall !== null) {
			clearTimeout(this.#stepStall);
			this.#stepStall = null;
		}
	}

	#stopLoop() {
		this.#clearStepStall();
		if (this.#rafId !== null) {
			this.#scheduler.cancel(this.#rafId);
			this.#rafId = null;
		}
	}
}
