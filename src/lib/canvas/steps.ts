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

/**
 * Drives a flat list of steps at an absolute time. Scenes and background
 * threads share the same logic, so seeking behaves the same everywhere.
 */
export class StepRunner {
	#completed = 0;
	#active: number | null = null;
	#activeProgress = 0;

	constructor(readonly steps: readonly Step[]) {}

	get duration(): number {
		return this.steps.reduce((total, step) => total + step.duration, 0);
	}

	seek(seconds: number) {
		const total = this.duration;
		const target = Math.min(total, Math.max(0, seconds));

		if (target <= 0) this.reset();

		let index = 0;
		let cursor = 0;
		for (; index < this.steps.length; index++) {
			const step = this.steps[index]!;
			const end = cursor + step.duration;
			if (target < end) break;
			cursor = end;
		}

		if (index >= this.steps.length) {
			this.completeTo(this.steps.length);
			return;
		}

		const step = this.steps[index]!;
		const progress = step.duration > 0 ? (target - cursor) / step.duration : 1;
		const rewound =
			index < this.#completed ||
			(this.#active !== null &&
				(index < this.#active ||
					(index === this.#active && progress + 1e-9 < this.#activeProgress)));
		if (rewound) this.reset();

		this.completeTo(index);

		if (this.#active !== index) {
			step.start();
			this.#active = index;
			this.#activeProgress = 0;
		}

		step.setProgress(progress);
		this.#activeProgress = progress;
	}

	completeTo(index: number) {
		while (this.#completed < index) {
			const step = this.steps[this.#completed]!;
			if (this.#active !== this.#completed) {
				step.start();
				this.#active = this.#completed;
			}
			step.setProgress(1);
			step.end();
			this.#active = null;
			this.#completed += 1;
			this.#activeProgress = 0;
		}
	}

	reset() {
		if (this.#active !== null) this.steps[this.#active]?.revert();
		for (let index = this.#completed - 1; index >= 0; index--) {
			this.steps[index]?.revert();
		}
		this.#completed = 0;
		this.#active = null;
		this.#activeProgress = 0;
	}
}

/** Plays several animations one after another as one timeline step. */
export class SequenceStep implements Step {
	readonly label = 'sequence';
	readonly steps: readonly Step[];
	#runner: StepRunner;

	constructor(steps: readonly Step[]) {
		this.steps = steps;
		this.#runner = new StepRunner(steps);
	}

	get duration(): number {
		return this.#runner.duration;
	}

	start() {
		this.#runner.reset();
		this.#runner.seek(0);
	}

	setProgress(progress: number) {
		this.#runner.seek(clamp(progress, 0, 1) * this.duration);
	}

	end() {
		this.#runner.seek(this.duration);
	}

	revert() {
		this.#runner.reset();
	}

	drawOverlay(ctx: CanvasRenderingContext2D, time: number) {
		for (const step of this.steps) step.drawOverlay?.(ctx, time);
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

	get duration(): number {
		return this.step.duration;
	}

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

/** Runs animations one after another inside a single timeline step. */
export function sequence(...animations: Animation[]): Animation {
	return new Animation(new SequenceStep(animations.map((animation) => animation.step)));
}

export function tween<T>(
	signal: Signal<T>,
	to: T,
	duration = 0.5,
	ease: Easing = easeInOut
): Animation {
	return signal.to(to, duration, ease);
}
