import { clamp, easeInOut, type Easing } from './easing.js';
import type { Interpolate, Signal } from './signal.js';

export interface Step {
	readonly duration: number;
	readonly label: string;
	start(): void;
	setProgress(progress: number): void;
	end(): void;
	revert(): void;
	drawOverlay?(ctx: CanvasRenderingContext2D): void;
}

export class WaitStep implements Step {
	readonly label = 'wait';

	constructor(readonly duration: number) {}

	start() {}
	setProgress() {}
	end() {}
	revert() {}
}

export class TweenStep<T> implements Step {
	#from: T | undefined;
	#started = false;

	constructor(
		readonly signal: Signal<T>,
		readonly to: T,
		readonly duration: number,
		readonly ease: Easing,
		readonly interpolate: Interpolate<T>,
		readonly label = 'tween'
	) {}

	start() {
		this.#from = this.signal();
		this.#started = true;
	}

	setProgress(progress: number) {
		if (!this.#started || this.#from === undefined) return;
		const eased = this.ease(clamp(progress, 0, 1));
		this.signal(this.interpolate(this.#from, this.to, eased));
	}

	end() {
		if (!this.#started) return;
		this.signal(this.to);
	}

	revert() {
		if (!this.#started || this.#from === undefined) return;
		this.signal(this.#from);
		this.#started = false;
	}
}

export class ParallelStep implements Step {
	readonly label = 'parallel';
	#done: boolean[] = [];

	constructor(readonly steps: readonly Step[]) {}

	get duration(): number {
		return Math.max(0, ...this.steps.map((step) => step.duration));
	}

	start() {
		this.#done = this.steps.map(() => false);
		for (const step of this.steps) step.start();
	}

	setProgress(progress: number) {
		const total = this.duration;
		const elapsed = clamp(progress, 0, 1) * total;

		this.steps.forEach((step, index) => {
			if (this.#done[index]) return;
			const stepProgress = step.duration > 0 ? clamp(elapsed / step.duration, 0, 1) : 1;
			step.setProgress(stepProgress);
			if (stepProgress >= 1) {
				step.end();
				this.#done[index] = true;
			}
		});
	}

	end() {
		for (const step of this.steps) step.end();
	}

	revert() {
		for (const step of this.steps) step.revert();
	}

	drawOverlay(ctx: CanvasRenderingContext2D) {
		for (const step of this.steps) step.drawOverlay?.(ctx);
	}
}

/*
	Animations are iterables so `yield*` records exactly one step while keeping
	the authoring code linear. The recorder drives the generator, never the
	renderer.
*/
export class Animation implements Iterable<Step> {
	constructor(readonly step: Step) {}

	*[Symbol.iterator]() {
		yield this.step;
	}
}

export function wait(seconds = 1): Animation {
	return new Animation(new WaitStep(seconds));
}

export function all(...animations: Animation[]): Animation {
	return new Animation(new ParallelStep(animations.map((animation) => animation.step)));
}

export function tween<T>(
	signal: Signal<T>,
	to: T,
	duration = 0.5,
	ease: Easing = easeInOut
): Animation {
	return signal.to(to, duration, ease);
}
