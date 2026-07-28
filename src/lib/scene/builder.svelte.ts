import { onMount } from 'svelte';
import { page } from '$app/state';
import { deck } from '#lib/slides/config';
import { TweenStep, LayoutStep, ParallelStep, type Step } from './steps';
import { getSceneManager } from './context.svelte';
import { TransitionBuilder, type TransitionBuild } from './runtime.svelte';
import { easeInOut } from './easing';

export interface SceneBuilder<T> {
	tween(key: keyof T, to: number, duration?: number, ease?: (t: number) => number): this;
	layout(change: () => void, duration?: number, ease?: (t: number) => number): this;
	all(...fns: ((t: this) => void)[]): this;
	transitionIn(fn: TransitionBuild): this;
	transitionOut(fn: TransitionBuild): this;
	slideTransition(opts?: {
		duration?: number;
		ease?: (t: number) => number;
		distance?: number;
	}): this;
	fadeTransition(opts?: { duration?: number; ease?: (t: number) => number }): this;
	zoomTransition(opts?: { duration?: number; ease?: (t: number) => number; scale?: number }): this;
}
type Scene<T> = T & SceneBuilder<T>;
type Object = Record<string, unknown>;

export function scene<T extends Object>(initial: T = {} as T) {
	const state = $state(initial) as Scene<T>;
	const manager = getSceneManager();
	let steps: Step[] = [];
	let enterBuild: TransitionBuild | null = null;
	let exitBuild: TransitionBuild | null = null;

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
		steps.push(new LayoutStep(state, change, duration, ease));
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

	state.transitionIn = function (fn: TransitionBuild) {
		enterBuild = fn;
		if (enterBuild) {
			const temp = new TransitionBuilder(manager.transitionState);
			enterBuild(temp, manager.direction);
		}
		return this;
	};

	state.transitionOut = function (fn: TransitionBuild) {
		exitBuild = fn;
		return this;
	};

	state.slideTransition = function (opts?: {
		duration?: number;
		ease?: (t: number) => number;
		distance?: number;
	}) {
		const duration = opts?.duration ?? 0.5;
		const ease = opts?.ease ?? easeInOut;
		const distance = opts?.distance ?? 100;

		enterBuild = (t, d) => {
			const sign = d === 'forward' ? 1 : -1;
			t.set('x', sign * distance);
			t.set('opacity', 0);
			t.tween('x', 0, duration, ease);
			t.tween('opacity', 1, duration, ease);
		};

		exitBuild = (t, d) => {
			const sign = d === 'forward' ? 1 : -1;
			t.set('opacity', 1);
			t.tween('x', -sign * distance, duration, ease);
			t.tween('opacity', 0, duration, ease);
		};

		if (enterBuild) {
			const temp = new TransitionBuilder(manager.transitionState);
			enterBuild(temp, manager.direction);
		}

		return this;
	};

	state.fadeTransition = function (opts?: { duration?: number; ease?: (t: number) => number }) {
		const duration = opts?.duration ?? 0.5;
		const ease = opts?.ease ?? easeInOut;

		enterBuild = (t) => {
			t.set('opacity', 0);
			t.tween('opacity', 1, duration, ease);
		};

		exitBuild = (t) => {
			t.set('opacity', 1);
			t.tween('opacity', 0, duration, ease);
		};

		if (enterBuild) {
			const temp = new TransitionBuilder(manager.transitionState);
			enterBuild(temp, manager.direction);
		}

		return this;
	};

	state.zoomTransition = function (opts?: {
		duration?: number;
		ease?: (t: number) => number;
		scale?: number;
	}) {
		const duration = opts?.duration ?? 0.5;
		const ease = opts?.ease ?? easeInOut;
		const scale = opts?.scale ?? 0.5;

		enterBuild = (t) => {
			t.set('opacity', 0);
			t.set('scale', scale);
			t.tween('opacity', 1, duration, ease);
			t.tween('scale', 1, duration, ease);
		};

		exitBuild = (t) => {
			t.set('opacity', 1);
			t.set('scale', 1);
			t.tween('scale', scale, duration, ease);
			t.tween('opacity', 0, duration, ease);
		};

		if (enterBuild) {
			const temp = new TransitionBuilder(manager.transitionState);
			enterBuild(temp, manager.direction);
		}

		return this;
	};

	onMount(() => {
		manager.load({ steps, enterBuild, exitBuild, slug: page.params.slug ?? deck[0].slug });
		return () => manager.clear();
	});

	return state;
}
