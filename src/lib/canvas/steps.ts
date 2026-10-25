import { clamp, easeInOut, linear, type Easing } from './easing.js';
import type { Interpolate, Signal } from './signal.js';

export interface Step {
	readonly duration: number;
	readonly label: string;
	start(): void;
	setProgress(progress: number): void;
	end(): void;
	revert(): void;
	drawOverlay?(ctx: CanvasRenderingContext2D, time: number): void;
}

export class WaitStep implements Step {
	readonly label = 'wait';

	constructor(readonly duration: number) {}

	start() {}
	setProgress() {}
	end() {}
	revert() {}
}

export interface TickFrame {
	progress: number;
	time: number;
	deltaTime: number;
	frame: number;
}

export class TickStep implements Step {
	readonly label = 'tick';
	#onTick: (frame: TickFrame) => void;
	#duration: number;
	#ease: Easing;
	#time = 0;
	#frame = 0;

	constructor(onTick: (frame: TickFrame) => void, duration: number, ease: Easing = linear) {
		this.#onTick = onTick;
		this.#duration = duration;
		this.#ease = ease;
	}

	get duration(): number {
		return this.#duration;
	}

	start() {
		this.#time = 0;
		this.#frame = 0;
	}

	setProgress(progress: number) {
		const time = clamp(progress, 0, 1) * this.#duration;
		this.#frame++;
		this.#onTick({
			progress: this.#ease(clamp(progress, 0, 1)),
			time,
			deltaTime: time - this.#time,
			frame: this.#frame
		});
		this.#time = time;
	}

	end() {}

	revert() {
		this.#onTick({ progress: 0, time: 0, deltaTime: 0, frame: 0 });
		this.#time = 0;
		this.#frame = 0;
	}
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

	drawOverlay(ctx: CanvasRenderingContext2D, time: number) {
		for (const step of this.steps) step.drawOverlay?.(ctx, time);
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

export function tick(
	onTick: (frame: TickFrame) => void,
	duration = 0.5,
	ease: Easing = linear
): Animation {
	return new Animation(new TickStep(onTick, duration, ease));
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
