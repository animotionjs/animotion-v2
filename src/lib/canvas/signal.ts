import { easeInOut, type Easing } from './easing.js';
import { Animation, TweenStep } from './steps.js';

export type Subscriber = () => void;
export type Interpolate<T> = (from: T, to: T, progress: number) => T;

export interface Signal<T> {
	(): T;
	(value: T): void;
	get(): T;
	set(value: T): void;
	to(value: T, duration?: number, ease?: Easing): Animation;
	subscribe(subscriber: Subscriber): () => void;
}

export function numberInterpolate(from: number, to: number, progress: number): number {
	return from + (to - from) * progress;
}

export function discreteInterpolate<T>(from: T, to: T, progress: number): T {
	return progress < 0.5 ? from : to;
}

export function createSignal<T>(
	initial: T,
	interpolate: Interpolate<T> = discreteInterpolate,
	name = 'value'
): Signal<T> {
	let value = initial;
	const subscribers = new Set<Subscriber>();

	const notify = () => {
		for (const subscriber of subscribers) subscriber();
	};

	const set = (next: T) => {
		if (Object.is(value, next)) return;
		value = next;
		notify();
	};

	const signal = function (...args: [] | [T]): T | void {
		if (args.length === 0) return value;
		set(args[0] as T);
	} as Signal<T>;

	signal.get = () => value;
	signal.set = set;
	signal.subscribe = (subscriber) => {
		subscribers.add(subscriber);
		return () => subscribers.delete(subscriber);
	};
	signal.to = (to, duration = 0.5, ease = easeInOut) =>
		new Animation(new TweenStep(signal, to, duration, ease, interpolate, name));

	return signal;
}

export function numberSignal(initial: number, name = 'value'): Signal<number> {
	return createSignal(initial, numberInterpolate, name);
}

export function stringSignal(initial: string, name = 'value'): Signal<string> {
	return createSignal(initial, discreteInterpolate, name);
}
