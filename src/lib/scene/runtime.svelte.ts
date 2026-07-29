import { flushSync } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { TweenStep, ParallelStep, type Step } from './steps';
import { RealTimeScheduler, RenderScheduler, type FrameScheduler } from './scheduler';
import { easeInOut } from './easing';

type SavedState = {
	stepIndex: number;
	stepCompleted: boolean;
};
export type Direction = 'forward' | 'backward';
export type TransitionBuild = (builder: TransitionBuilder, direction: Direction) => void;

export class TransitionBuilder {
	#state: Record<string, number>;
	#steps: Step[] = [];

	constructor(state: Record<string, number>) {
		this.#state = state;
	}

	set(key: string, value: number) {
		this.#state[key] = value;
	}

	tween(key: string, to: number, duration = 0.5, ease: (t: number) => number = easeInOut) {
		this.#steps.push(new TweenStep(this.#state, key, to, duration, ease));
		return this;
	}

	getSteps(): Step[] {
		return this.#steps;
	}
}

export class SceneManager {
	#phase: 'paused' | 'tweening' | 'finished' = $state('finished');
	#stepIndex = $state(0);
	#totalSteps = $state(0);
	#steps: Step[] = [];
	#elapsed = 0;
	#stepCompleted = $state(false);
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

	#stepChangeListeners = new Set<(step: number, total: number) => void>();

	onStepChange(listener: (step: number, total: number) => void): () => void {
		this.#stepChangeListeners.add(listener);
		return () => this.#stepChangeListeners.delete(listener);
	}

	#emitStepChange() {
		for (const listener of this.#stepChangeListeners) {
			listener(this.#stepIndex, this.#totalSteps);
		}
	}

	get finished(): boolean {
		return this.#phase === 'finished';
	}

	get step(): number {
		return this.#stepIndex;
	}

	get totalSteps(): number {
		return this.#totalSteps;
	}

	get atStart(): boolean {
		return this.#stepIndex === 0 && !this.#stepCompleted;
	}

	get completion(): number {
		if (this.#phase === 'finished') return 1;
		if (this.#totalSteps === 0) return 0;
		const done = this.#phase !== 'paused' || this.#stepCompleted;
		return (this.#stepIndex + (done ? 1 : 0)) / this.totalSteps;
	}

	get transitionState() {
		return this.#transitionState;
	}

	get direction(): Direction {
		return this.#direction;
	}

	get phase(): string {
		return this.#phase;
	}

	get transitionActive(): boolean {
		return this.#transitionRafId !== null;
	}

	get isAnimating(): boolean {
		return this.#phase === 'tweening' || this.#transitionRafId !== null;
	}

	get exitBusy(): boolean {
		return this.#exitBusy;
	}

	setDirection(direction: Direction) {
		this.#direction = direction;
	}

	setEnterTransition(build: TransitionBuild | null) {
		this.#enterBuild = build;
	}

	setExitTransition(build: TransitionBuild | null) {
		this.#exitBuild = build;
	}

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

	advanceFrame(deltaSeconds: number): { done: boolean } {
		const pending = (this.#scheduler as RenderScheduler).tick(deltaSeconds);
		return {
			done: pending === 0 && !this.transitionActive && !this.isAnimating
		};
	}

	saveState(slug: string) {
		this.#savedStates.set(slug, {
			stepIndex: this.#stepIndex,
			stepCompleted: this.#stepCompleted
		});
	}

	hasSavedState(slug: string): boolean {
		return this.#savedStates.has(slug);
	}

	load({
		steps,
		slug,
		enterBuild,
		exitBuild
	}: {
		steps: Step[];
		slug?: string;
		enterBuild?: TransitionBuild | null;
		exitBuild?: TransitionBuild | null;
	}) {
		this.#softClear();

		if (enterBuild) this.#enterBuild = enterBuild;
		if (exitBuild) this.#exitBuild = exitBuild;

		const saved = slug ? this.#savedStates.get(slug) : undefined;

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
	}

	clear() {
		this.#softClear();
		this.#resetTransitionState();
	}

	playEnter(): Promise<void> {
		return this.#playTransition(this.#enterBuild);
	}

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
			this.#phase = 'tweening';
			this.#startLoop();
		}
	}

	prev() {
		this.#stopLoop();

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
