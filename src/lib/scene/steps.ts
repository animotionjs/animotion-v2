import { flushSync } from 'svelte';
import { clamp, easeInOut, lerp } from './easing';

export interface Step {
	readonly duration: number;
	setProgress(p: number): void;
	start(): void;
	end(): void;
	revert(): void;
}

export class TweenStep implements Step {
	#state: Record<string, unknown>;
	#key: string;
	#to: number;
	#duration: number;
	#ease: (t: number) => number;
	#from = 0;

	constructor(
		state: Record<string, unknown>,
		key: string,
		to: number,
		duration: number,
		ease: (t: number) => number = easeInOut
	) {
		this.#state = state;
		this.#key = key;
		this.#to = to;
		this.#duration = duration;
		this.#ease = ease;
	}

	get duration(): number {
		return this.#duration;
	}

	setProgress(p: number) {
		this.#state[this.#key] = lerp(this.#from, this.#to, this.#ease(clamp(p, 0, 1)));
	}

	start() {
		this.#from = this.#state[this.#key] as number;
	}

	end() {
		this.#state[this.#key] = this.#to;
	}

	revert() {
		this.#state[this.#key] = this.#from;
	}
}

export class LayoutStep implements Step {
	#state: Record<string, unknown>;
	#change: () => void;
	#duration: number;
	#ease: (t: number) => number;
	#snapshot: Record<string, unknown> = {};
	#tweens: Array<{
		el: HTMLElement;
		deltaX: number;
		deltaY: number;
		scaleX: number;
		scaleY: number;
	}> = [];

	constructor(
		state: Record<string, unknown>,
		change: () => void,
		duration: number,
		ease: (t: number) => number = easeInOut
	) {
		this.#state = state;
		this.#change = change;
		this.#duration = duration;
		this.#ease = ease;
	}

	get duration(): number {
		return this.#duration;
	}

	setProgress(p: number) {
		const progress = clamp(p, 0, 1);
		const eased = this.#ease(progress);
		for (const { el, deltaX, deltaY, scaleX, scaleY } of this.#tweens) {
			el.style.transform = `translate(${deltaX * (1 - eased)}px, ${deltaY * (1 - eased)}px) scale(${lerp(scaleX, 1, eased)}, ${lerp(scaleY, 1, eased)})`;
		}
	}

	start() {
		this.#snapshot = {};
		for (const key of Object.keys(this.#state)) {
			const val = this.#state[key];
			if (Array.isArray(val)) {
				this.#snapshot[key] = [...val];
			} else {
				this.#snapshot[key] = val;
			}
		}

		const elements = [...document.querySelectorAll('[data-layout]')] as HTMLElement[];
		const firstBounds: Record<string, DOMRect> = {};
		for (const el of elements) {
			const rect = el.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				firstBounds[el.dataset.layout!] = rect;
			}
		}

		this.#change();
		flushSync();

		const lastElements = [...document.querySelectorAll('[data-layout]')] as HTMLElement[];
		this.#tweens = [];
		for (const el of lastElements) {
			const curr = el.getBoundingClientRect();
			const prev = firstBounds[el.dataset.layout!];
			if (!prev) continue;

			const deltaX = prev.left - curr.left;
			const deltaY = prev.top - curr.top;
			const scaleX = prev.width / curr.width;
			const scaleY = prev.height / curr.height;

			el.style.transformOrigin = 'top left';
			el.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`;

			this.#tweens.push({ el, deltaX, deltaY, scaleX, scaleY });
		}
	}

	end() {
		for (const { el } of this.#tweens) el.style.transform = '';
		this.#tweens = [];
	}

	revert() {
		for (const key of Object.keys(this.#snapshot)) {
			this.#state[key] = this.#snapshot[key];
		}
		for (const { el } of this.#tweens) el.style.transform = '';
		this.#tweens = [];
		this.#snapshot = {};
	}
}

export class ParallelStep implements Step {
	#steps: Step[];
	#done: boolean[] = [];

	constructor(steps: Step[]) {
		this.#steps = steps;
	}

	get duration(): number {
		return Math.max(...this.#steps.map((s) => s.duration));
	}

	setProgress(p: number) {
		const progress = clamp(p, 0, 1);
		for (let i = 0; i < this.#steps.length; i++) {
			if (this.#done[i]) continue;
			this.#steps[i].setProgress(progress);
			if (progress >= 1) {
				this.#done[i] = true;
				this.#steps[i].end();
			}
		}
	}

	start() {
		this.#done = this.#steps.map(() => false);
		for (const step of this.#steps) step.start();
	}

	end() {
		for (let i = 0; i < this.#steps.length; i++) {
			if (!this.#done[i]) this.#steps[i].end();
		}
		this.#done = [];
	}

	revert() {
		for (const step of this.#steps) step.revert();
	}
}
