import { onMount } from 'svelte';
import { TweenStep, LayoutStep, ParallelStep, type Step } from './steps';
import { getSceneManager } from './context.svelte';
import { easeInOut } from './easing';

export interface SceneBuilder {
	tween(key: string, to: number, duration?: number, ease?: (t: number) => number): this;
	layout(change: () => void, duration?: number, ease?: (t: number) => number): this;
	all(...fns: ((t: this) => void)[]): this;
}
type Scene<T> = T & SceneBuilder;
type Object = Record<string, unknown>;

export function scene<T extends Object>(initial: T) {
	const state = $state(initial) as Scene<T>;
	const snapshot = { ...initial };
	let steps: Step[] = [];

	state.tween = function (
		key: string,
		to: number,
		duration = 0.5,
		ease: (t: number) => number = easeInOut
	) {
		steps.push(new TweenStep(state, key, to, duration, ease));
		return this;
	};

	state.layout = function (
		change: () => void,
		duration = 0.5,
		ease: (t: number) => number = easeInOut
	) {
		steps.push(new LayoutStep(change, duration, ease));
		return this;
	};

	state.all = function (...fns: ((t: Scene<T>) => void)[]) {
		const saved = steps;
		const parallelSteps: Step[] = [];
		steps = parallelSteps;
		for (const fn of fns) fn(this);
		steps = saved;
		steps.push(new ParallelStep(parallelSteps));
		return this;
	};

	const manager = getSceneManager();

	onMount(() => {
		manager.load({
			steps,
			reset: () => {
				for (const key of Object.keys(snapshot)) {
					(state as Object)[key] = snapshot[key];
				}
			}
		});
		return () => manager.clear();
	});

	return state;
}
