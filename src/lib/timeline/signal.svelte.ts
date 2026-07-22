import { clamp, easeInOut, lerp } from './easing';

interface SignalManager {
	register(signal: Signal<unknown>): void;
}

interface Signal<T = number> {
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

	function s(v?: T) {
		signalManager.currentManager?.register(s);
		if (v === undefined) return value;
		value = v;
	}

	return Object.assign(s, {
		initial,
		tween: function* (to: number, dur: number, ease = easeInOut) {
			signalManager.currentManager?.register(s);
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
	}) as Signal<T>;
}
