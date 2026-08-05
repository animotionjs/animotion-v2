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
	#stepCompleted = $state(false);
	#needsStart = false;
	#rafId: number | null = null;
	#transitionRafId: number | null = null;
	#lastFrame = 0;
	#transitionLastFrame = 0;
	#transitionElapsed = 0;
	#savedStates = new SvelteMap<string, SavedState>();

	#transitionState = $state({ opacity: 1, x: 0, y: 0, scale: 1 });
	#direction: Direction = 'forward';
	#scheduler: FrameScheduler = new RealTimeScheduler();
	#renderMode = false;
	#enterBuild: TransitionBuild | null = null;
	#exitBuild: TransitionBuild | null = null;
	#exitBusy = false;

	#stepChangeListeners = new SvelteSet<(step: number, total: number) => void>();

	/** Subscribes to step changes; returns an unsubscribe function. */
	onStepChange(listener: (step: number, total: number) => void): () => void {
		this.#stepChangeListeners.add(listener);
		return () => this.#stepChangeListeners.delete(listener);
	}

	#emitStepChange() {
		for (const listener of this.#stepChangeListeners) {
			listener(this.#stepIndex, this.#totalSteps);
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

	/** Total number of steps in the loaded scene. */
	get totalSteps(): number {
		return this.#totalSteps;
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

	/** Whether a state was saved for `id`. */
	hasSavedState(id: string): boolean {
		return this.#savedStates.has(id);
	}

	/**
	 * Loads a scene's steps into the manager. If `id` has a saved state, the
	 * scene is fast-forwarded to that step. Used by `createScene` on mount.
	 */
	load({
		steps,
		id,
		enterBuild,
		exitBuild
	}: {
		steps: Step[];
		id?: string;
		enterBuild?: TransitionBuild | null;
		exitBuild?: TransitionBuild | null;
	}) {
		this.#softClear();

		if (enterBuild) this.#enterBuild = enterBuild;
		if (exitBuild) this.#exitBuild = exitBuild;

		const saved = id ? this.#savedStates.get(id) : undefined;

		this.#steps = steps;
		this.#totalSteps = steps.length;

		if (steps.length === 0) {
			this.#phase = 'finished';
		} else {
			this.#stepIndex = 0;
			this.#elapsed = 0;
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
			} else {
				this.#enterStep(this.#stepIndex);
			}
		}

		this.#emitStepChange();

		if (this.#enterBuild) {
			this.playEnter();
		} else {
			this.#resetTransitionState();
		}
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
		this.#stepCompleted = false;
		this.#needsStart = false;
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

	/** Plays the exit transition and resolves when it completes. */
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

		const frame = (now: number) => {
			const delta = (now - this.#transitionLastFrame) / 1000;
			this.#transitionLastFrame = now;

			this.#transitionElapsed += delta;
			const progress = this.#transitionElapsed / step.duration;
			step.setProgress(progress);
			if (this.#renderMode) flushSync();

			if (progress >= 1) {
				step.end();
				this.#transitionRafId = null;
				onComplete();
				return;
			}

			this.#transitionRafId = this.#scheduler.request(frame);
		};

		this.#transitionRafId = this.#scheduler.request(frame);
	}

	#stopTransitionLoop() {
		if (this.#transitionRafId !== null) {
			this.#scheduler.cancel(this.#transitionRafId);
			this.#transitionRafId = null;
		}
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
			this.#phase = 'tweening';
			this.#startLoop();
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
			this.#phase = 'paused';
			this.#emitStepChange();
			return;
		}

		this.#currentStep()?.revert();

		if (this.#stepIndex === 0) {
			this.#stepCompleted = false;
			this.#phase = 'paused';
			return;
		}

		this.#stepIndex--;
		this.#stepCompleted = true;
		this.#phase = 'paused';
		this.#emitStepChange();
	}

	#currentStep(): Step | undefined {
		return this.#steps[this.#stepIndex];
	}

	#playCurrent() {
		const step = this.#currentStep();
		if (step && step.duration > 0) {
			this.#phase = 'tweening';
			this.#startLoop();
		}
	}

	#enterStep(index: number) {
		const step = this.#steps[index];
		if (!step) return;
		this.#needsStart = false;

		step.start();
		this.#elapsed = 0;
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

		const frame = (now: number) => {
			const delta = (now - this.#lastFrame) / 1000;
			this.#lastFrame = now;

			this.#elapsed += delta;
			const progress = this.#elapsed / step.duration;
			step.setProgress(progress);
			if (this.#renderMode) flushSync();

			if (progress >= 1) {
				step.end();
				this.#stepCompleted = true;
				this.#rafId = null;
				if (this.#stepIndex >= this.#steps.length - 1) {
					this.#phase = 'finished';
				} else {
					this.#phase = 'paused';
				}
				return;
			}

			if (this.#phase !== 'tweening') return;

			this.#rafId = this.#scheduler.request(frame);
		};

		this.#rafId = this.#scheduler.request(frame);
	}

	#stopLoop() {
		if (this.#rafId !== null) {
			this.#scheduler.cancel(this.#rafId);
			this.#rafId = null;
		}
	}
}
