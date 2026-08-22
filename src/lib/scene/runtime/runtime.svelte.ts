import { flushSync } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { TweenStep, ParallelStep, type Step } from './steps';
import { RealTimeScheduler, RenderScheduler, type FrameScheduler } from './scheduler';
import { easeInOut, type Easing } from '../easing';

/** Which way the user is moving through the presentation. */
export type Direction = 'forward' | 'backward';

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
	getSteps(): Step[] {
		return this.#steps;
	}
}

/**
 * Drives a scene's steps and transitions. One manager per presentation; it is
 * created by `<Scenes>` and exposed via {@link getSceneManager}.
 */
export class SceneManager {
	#phase: 'paused' | 'tweening' | 'finished' = $state('finished');
	#stepIndex = $state(0);
	#totalSteps = $state(0);
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
	onStepChange(listener: (step: number, total: number) => void): () => void {
		this.#stepChangeListeners.add(listener);
		return () => this.#stepChangeListeners.delete(listener);
	}

	#emitStepChange() {
		for (const listener of this.#stepChangeListeners) {
			listener(this.currentStep, this.#totalSteps);
		}
	}

	/** Whether all steps have completed. */
	get finished(): boolean {
		return this.#phase === 'finished';
	}

	/** The 0-based index of the current step. */
	get step(): number {
		return this.#stepIndex;
	}

	/**
	 * The step the user is currently on: a completed step counts as the next
	 * one, so a scene with the first step played reports `1`.
	 */
	get currentStep(): number {
		return this.#stepCompleted ? this.#stepIndex + 1 : this.#stepIndex;
	}

	/** Total number of steps in the loaded scene. */
	get totalSteps(): number {
		return this.#totalSteps;
	}

	/** Whether the current step's animation has fully played. */
	get stepCompleted(): boolean {
		return this.#stepCompleted;
	}

	/** Whether the current step's animation is playing. */
	get playing(): boolean {
		return this.#phase === 'tweening';
	}

	/** Whether the scene is at its first step with nothing played yet. */
	get atStart(): boolean {
		return this.#stepIndex === 0 && !this.#stepCompleted;
	}

	/** Overall progress through the scene as a fraction of total steps. */
	get completion(): number {
		if (this.#phase === 'finished') return 1;
		if (this.#totalSteps === 0) return 0;
		const done = this.#phase !== 'paused' || this.#stepCompleted;
		return (this.#stepIndex + (done ? 1 : 0)) / this.totalSteps;
	}

	/** Progress 0..1 through the current step; 1 while paused on a completed step. */
	get stepProgress(): number {
		return this.#stepProgress;
	}

	/** Reactive transition state read by `<Scene>`: `opacity`, `x`, `y`, `scale`. */
	get transitionState() {
		return this.#transitionState;
	}

	/** The last direction set via {@link setDirection}. */
	get direction(): Direction {
		return this.#direction;
	}

	/** Current phase: `'paused'`, `'tweening'`, or `'finished'`. */
	get phase(): string {
		return this.#phase;
	}

	/** Whether a scene transition is currently animating. */
	get transitionActive(): boolean {
		return this.#transitionRafId !== null;
	}

	/** Whether a step or transition is currently animating. */
	get isAnimating(): boolean {
		return this.#phase === 'tweening' || this.#transitionRafId !== null;
	}

	/** Whether the exit transition is still playing. */
	get exitBusy(): boolean {
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
	enableRenderMode(): RenderScheduler {
		this.#stopLoop();
		this.#stopTransitionLoop();
		const render = new RenderScheduler();
		this.#scheduler = render;
		this.#rafId = null;
		this.#transitionRafId = null;
		this.#renderMode = true;
		return render;
	}

	/** Advances the render scheduler by `deltaSeconds`; resolves when idle. */
	advanceFrame(deltaSeconds: number): { done: boolean } {
		const pending = (this.#scheduler as RenderScheduler).tick(deltaSeconds);
		return {
			done: pending === 0 && !this.transitionActive && !this.isAnimating
		};
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
	hasSavedState(id: string): boolean {
		return this.#savedStates.has(id);
	}

	/** Returns the saved state for `id`, or `undefined` if none was saved. */
	getSavedState(id: string): SavedState | undefined {
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

			const target = saved ? (saved.stepCompleted ? saved.stepIndex + 1 : saved.stepIndex) : 0;
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
				// Resumed past the start: steps 0..target-1 are complete, so we
				// pause between them and the next step (the state normal playback
				// reaches after the previous step finishes). This keeps `prev()`
				// from being a no-op when the resumed step is entered but unplayed.
				this.#stepIndex = target - 1;
				this.#stepCompleted = true;
				this.#phase = 'paused';
				this.#stepProgress = 1;
			} else {
				// A fresh scene rests at its initial state; the first step is
				// started on the first `next` (or a mirror's `play`). Starting
				// it eagerly would show a layout step's mid-animation frame on
				// load instead of the scene's true start.
				this.#needsStart = true;
				this.#phase = 'paused';
			}
		}

		this.#emitStepChange();

		// The enter transition plays when navigating between scenes; on the very
		// first load of a page session it is skipped so a reload jumps straight
		// to the resumed step. Render mode always plays it: the renderer drives
		// it explicitly and every render scene is a fresh-page first load.
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

		// Undo every step that has been started, in reverse, so previously
		// applied layout side-effects and state are removed before replaying
		// the position below. This is what lets the scene move backwards.
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

	/** Plays the enter transition and resolves when it completes. */
	playEnter(): Promise<void> {
		return this.#playTransition(this.#enterBuild);
	}

	/**
	 * Plays the exit transition and resolves when it completes. The transition
	 * is given a deadline equal to its duration, so it resolves even when
	 * `requestAnimationFrame` never fires (e.g. a window on a non-active
	 * virtual desktop), which would otherwise block the navigation that awaits
	 * `playExit`.
	 */
	playExit(): Promise<void> {
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

	#playTransition(buildFn: TransitionBuild | null): Promise<void> {
		return new Promise((resolve) => {
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
			this.#playStep(composite, resolve);
		});
	}

	#playStep(step: Step, onComplete: () => void) {
		this.#stopTransitionLoop();
		step.start();
		this.#transitionElapsed = 0;
		this.#transitionLastFrame = this.#scheduler.now();

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

		// A window the compositor is not presenting (e.g. on a non-active
		// virtual desktop) never receives animation frames, so the tween above
		// would stall and the transition promise would never resolve, blocking
		// the navigation that awaits it. The two timers below cover that:
		//   - a short stall force-completes the transition when no frame has
		//     arrived at all (the window was already hidden);
		//   - a deadline at the transition's nominal duration force-completes
		//     it when frames stop arriving mid-transition (the window hid
		//     after it had begun).
		// A visible window delivers frames throughout and finishes the tween
		// first, clearing both. Render mode drives frames deterministically,
		// so it skips the timers.
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

	#currentStep(): Step | undefined {
		return this.#steps[this.#stepIndex];
	}
	/**
	 * Total seconds spent on `step`: its animation plus any waits after it.
	 * Live playback only spends the animation duration on each step.
	 */
	#totalFor(step: Step): number {
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

		// A window the compositor is not presenting (e.g. on a non-active
		// virtual desktop) never receives animation frames, so this tween would
		// never complete and the step would need an extra press to fast-forward
		// past it. A stall timer at the step's duration finishes it on its own,
		// in step with a visible mirror's animation; a visible window finishes
		// the tween first and clears it. The timer stays armed for the whole
		// step, so it also catches a window that hides mid-tween. Render mode
		// drives frames deterministically, so it skips the timer.
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
