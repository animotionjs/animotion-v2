import { clamp, easeInOut, lerp } from './easing';

interface SignalManager {
	register(signal: { reset(): void }): void;
}

export interface Signal<T = number> {
	(): T;
	(v: T): void;
	readonly initial: T;
	tween(to: number, dur: number, ease?: (t: number) => number): Generator<unknown, void, number>;
	reset(): void;
}

export const signalManager = {
	currentManager: null as SignalManager | null
};

export function signal<T>(initial: T): Signal<T> {
	let value = $state(initial);

	function s(): T;
	function s(v: T): void;
	function s(v?: T): T | void {
		if (v === undefined) return value;
		value = v;
	}

	const obj = Object.assign(s, {
		initial,
		tween: function* (to: number, dur: number, ease = easeInOut) {
			const from = value as number;
			let elapsed = 0;
			while (elapsed < dur) {
				const delta = (yield) as number;
				elapsed += delta;
				value = lerp(from, to, ease(clamp(elapsed / dur, 0, 1))) as T;
			}
			value = to as T;
		},
		reset: () => {
			value = initial;
		}
	}) as unknown as Signal<T>;

	signalManager.currentManager?.register(obj);
	return obj;
}
