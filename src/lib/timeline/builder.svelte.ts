import { untrack } from 'svelte';
import { getSceneManager } from './context.svelte';
import { easeInOut } from './easing';
import { TweenStep, LayoutStep, ParallelStep, type Step } from './steps';

export interface TimelineBuilder {
	tween(key: string, to: number, dur?: number, ease?: (t: number) => number): this;
	layout(change: () => void, dur?: number, ease?: (t: number) => number): this;
	parallel(...fns: (() => void)[]): this;
}

export function timeline<T extends Record<string, unknown>>(initial: T): T & TimelineBuilder {
	const state = $state({ ...initial }) as T & TimelineBuilder;
	const initialCopy = { ...initial };
	let steps: Step[] = [];

	state.tween = function (key: string, to: number, dur = 0.5, ease: (t: number) => number = easeInOut) {
		steps.push(new TweenStep(state as unknown as Record<string, unknown>, key, to, dur, ease));
		return this as T & TimelineBuilder;
	};

	state.layout = function (change: () => void, dur = 0.5, ease: (t: number) => number = easeInOut) {
		steps.push(new LayoutStep(change, dur, ease));
		return this as T & TimelineBuilder;
	};

	state.parallel = function (...fns: (() => void)[]) {
		const saved = steps;
		const parallelSteps: Step[] = [];
		steps = parallelSteps;
		for (const fn of fns) fn();
		steps = saved;
		steps.push(new ParallelStep(parallelSteps));
		return this as T & TimelineBuilder;
	};

	const manager = getSceneManager();

	$effect(() => {
		untrack(() =>
			manager.attach({
				steps: [...steps],
				reset: () => {
					for (const key of Object.keys(initialCopy)) {
						(state as unknown as Record<string, unknown>)[key] = initialCopy[key];
					}
				}
			})
		);
		return () => manager.detach();
	});

	return state;
}
