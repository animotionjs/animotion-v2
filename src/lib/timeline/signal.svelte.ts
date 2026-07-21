import { clamp, easeInOut, lerp } from './easing';

export class Signal {
	#value = $state(0);
	readonly initial: number;

	constructor(initial: number) {
		this.initial = initial;
		this.#value = initial;
	}

	get current(): number {
		return this.#value;
	}

	set current(v: number) {
		this.#value = v;
	}

	*tween(
		to: number,
		dur: number,
		ease: (t: number) => number = easeInOut
	): Generator<unknown, void, number> {
		const from = this.#value;
		let elapsed = 0;
		while (elapsed < dur) {
			const delta = yield;
			elapsed += delta;
			this.#value = lerp(from, to, ease(clamp(elapsed / dur, 0, 1)));
		}
		this.#value = to;
	}
}
