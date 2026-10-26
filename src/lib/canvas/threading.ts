import { clamp } from './easing.js';
import { Animation, WaitStep, type Step } from './steps.js';

export class Thread {
	readonly animation: Animation;
	readonly start: number;
	#end: number;

	constructor(animation: Animation, start: number) {
		this.animation = animation;
		this.start = start;
		this.#end = start + animation.duration;
	}

	/** The scene time at which this thread stops, including a cancellation. */
	get end(): number {
		return this.#end;
	}

	get duration(): number {
		return this.animation.duration;
	}

	cancel(time: number) {
		this.#end = Math.min(this.#end, Math.max(this.start, time));
	}
}

/**
 * Tracks background threads while a scene is recorded. Steps advance the
 * recorder clock, so spawn and join know where they sit in the timeline.
 */
export class ThreadRecorder {
	elapsed = 0;
	readonly threads: Thread[] = [];

	spawn(animation: Animation): Thread {
		const thread = new Thread(animation, this.elapsed);
		this.threads.push(thread);
		return thread;
	}

	join(thread: Thread): Animation {
		return new Animation(new WaitStep(Math.max(0, thread.end - this.elapsed)));
	}

	cancel(thread: Thread) {
		thread.cancel(this.elapsed);
	}

	advance(step: Step) {
		this.elapsed += step.duration;
	}
}

let active: ThreadRecorder | null = null;

export function withThreadRecorder<T>(recorder: ThreadRecorder, run: () => T): T {
	const previous = active;
	active = recorder;
	try {
		return run();
	} finally {
		active = previous;
	}
}

function recorder(): ThreadRecorder {
	if (!active) {
		throw new Error('Background threads are only available while a scene is recorded.');
	}
	return active;
}

/** Starts an animation in the background at the current scene time. */
export function spawn(animation: Animation): Thread {
	return recorder().spawn(animation);
}

/** Waits for a background thread to finish. */
export function join(thread: Thread): Animation {
	return recorder().join(thread);
}

/** Alias for `join`, named for the waiting side of a thread. */
export function waitFor(thread: Thread): Animation {
	return join(thread);
}

/** Stops a background thread at the current scene time. */
export function cancel(thread: Thread): void {
	recorder().cancel(thread);
}

/**
 * Repeats an animation a fixed number of times. The factory runs at each
 * iteration, so relative values see the state left by the previous pass.
 */
export function loop(create: () => Animation, iterations = 2): Animation {
	return new Animation(new LoopStep(create, Math.max(0, Math.floor(iterations))));
}

class LoopStep implements Step {
	readonly label = 'loop';
	readonly duration: number;
	#create: () => Animation;
	#count: number;
	#stepDuration: number;
	#steps: Step[] = [];
	#active = -1;
	#activeProgress = 0;

	constructor(create: () => Animation, count: number) {
		this.#create = create;
		this.#count = count;
		this.#stepDuration = count > 0 ? create().step.duration : 0;
		this.duration = count * this.#stepDuration;
	}

	start() {
		this.#reset();
	}

	setProgress(progress: number) {
		if (this.#count === 0) return;
		const target = clamp(progress, 0, 1) * this.duration;
		let index = this.#stepDuration > 0 ? Math.floor(target / this.#stepDuration) : this.#count - 1;
		index = Math.min(this.#count - 1, Math.max(0, index));
		const local =
			this.#stepDuration > 0 ? (target - index * this.#stepDuration) / this.#stepDuration : 1;

		const rewound =
			index < this.#active || (index === this.#active && local + 1e-9 < this.#activeProgress);
		if (rewound) this.#reset();

		while (this.#active < index) {
			if (this.#active >= 0) {
				const current = this.#steps[this.#active]!;
				current.setProgress(1);
				current.end();
			}
			this.#active += 1;
			const step = this.#create().step;
			this.#steps[this.#active] = step;
			step.start();
			this.#activeProgress = 0;
		}

		if (this.#active < 0) {
			this.#active = 0;
			const step = this.#create().step;
			this.#steps[0] = step;
			step.start();
		}

		const step = this.#steps[this.#active]!;
		step.setProgress(local);
		this.#activeProgress = local;
	}

	end() {
		if (this.#active >= 0) this.#steps[this.#active]?.end();
	}

	revert() {
		this.#reset();
	}

	drawOverlay(ctx: CanvasRenderingContext2D, time: number) {
		for (const step of this.#steps) step.drawOverlay?.(ctx, time);
	}

	#reset() {
		for (let index = this.#steps.length - 1; index >= 0; index--) {
			this.#steps[index]?.revert();
		}
		this.#steps = [];
		this.#active = -1;
		this.#activeProgress = 0;
	}
}
