import { onMount } from 'svelte';
import {
	TweenStep,
	LayoutStep,
	ParallelStep,
	CodeStep,
	SelectionStep,
	TickStep,
	type Step,
	type TickFrame,
	type LayoutOptions
} from './steps';
import { getSceneManager, getSceneId } from './context.svelte';
import { TransitionBuilder, type TransitionBuild } from './runtime.svelte';
import { easeInOut, type Easing } from './easing';
import { registerLanguages } from './highlighter';
import {
	setCodeState,
	createCodeState,
	buildEditTrees,
	makeCodeTree,
	resolveSingleRange,
	resolveRangeArray,
	smartIndent,
	DEFAULT,
	ALL_LINES,
	type CodeState,
	type CodeRange,
	type RangeResolver,
	type RawCodeFragment
} from './code.svelte';

export interface SceneBuilder<T> {
	tween(key: keyof T, to: number, duration?: number, ease?: Easing): this;
	tick(onTick: (frame: TickFrame) => void, duration?: number, ease?: Easing): this;
	layout(change: () => void, duration?: number, ease?: Easing, options?: LayoutOptions): this;
	all(fn: (scene: this) => void): this;
	transitionIn(fn: TransitionBuild): this;
	transitionOut(fn: TransitionBuild): this;
	slideTransition(opts?: { duration?: number; ease?: Easing; distance?: number }): this;
	fadeTransition(opts?: { duration?: number; ease?: Easing }): this;
	zoomTransition(opts?: { duration?: number; ease?: Easing; scale?: number }): this;
	codeTo(code: string, duration?: number, opts?: { language?: string; ease?: Easing }): this;
	codeAppend(code: string, duration?: number, ease?: Easing): this;
	codePrepend(code: string, duration?: number, ease?: Easing): this;
	codeInsert(
		range: CodeRange | CodeRange[] | RangeResolver,
		code: string,
		duration?: number,
		ease?: Easing
	): this;
	codeReplace(
		range: CodeRange | CodeRange[] | RangeResolver | string,
		code: string,
		duration?: number,
		ease?: Easing
	): this;
	codeRemove(
		range: CodeRange | CodeRange[] | RangeResolver | string,
		duration?: number,
		ease?: Easing
	): this;
	codeEdit(
		duration?: number
	): (strings: TemplateStringsArray, ...tags: (string | RawCodeFragment)[]) => this;
	codeSelection(
		range?: CodeRange | CodeRange[] | RangeResolver | string | typeof DEFAULT,
		duration?: number
	): this;
}
type Scene<T> = T & SceneBuilder<T>;
type Object = Record<string, unknown>;

export function createScene<T extends Object>(initial: T = {} as T) {
	const rawInitial = initial as Record<string, unknown>;
	const indent =
		typeof rawInitial.indent === 'string' && rawInitial.indent.length > 0
			? rawInitial.indent
			: '  ';
	delete rawInitial.indent;
	const state = $state(initial) as Scene<T>;
	const manager = getSceneManager();
	let steps: Step[] = [];
	let enterBuild: TransitionBuild | null = null;
	let exitBuild: TransitionBuild | null = null;

	let codeState: CodeState | null = null;
	const initialCode = rawInitial.code;
	const initialLanguage = rawInitial.language as string | undefined;
	if (initialLanguage) void registerLanguages([initialLanguage]);
	if (typeof initialCode === 'string') {
		codeState = createCodeState(initialLanguage ?? 'ts', smartIndent(initialCode, indent));
		setCodeState(codeState);
	}

	function applyIndent(code: string): string {
		return smartIndent(code, indent);
	}

	state.tween = function (key: string, to: number, duration = 0.5, ease: Easing = easeInOut) {
		steps.push(new TweenStep(state, key, to, duration, ease));
		return this;
	};

	state.tick = function (
		onTick: (frame: TickFrame) => void,
		duration = 0.5,
		ease: Easing = (p) => p
	) {
		steps.push(new TickStep(onTick, duration, ease));
		return this;
	};

	state.layout = function (
		change: () => void,
		duration = 0.5,
		ease: Easing = easeInOut,
		options?: LayoutOptions
	) {
		steps.push(new LayoutStep(state, change, duration, ease, options));
		return this;
	};

	state.all = function (this: Scene<T>, fn: (scene: Scene<T>) => void) {
		const saved = steps;
		const parallelSteps: Step[] = [];
		steps = parallelSteps;
		fn(this);
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
		ease?: Easing;
		distance?: number;
	}) {
		const duration = opts?.duration ?? 0.5;
		const ease = opts?.ease ?? easeInOut;
		const distance = opts?.distance ?? 100;

		enterBuild = (builder, direction) => {
			const sign = direction === 'forward' ? 1 : -1;
			builder.set('x', sign * distance);
			builder.set('opacity', 0);
			builder.tween('x', 0, duration, ease);
			builder.tween('opacity', 1, duration, ease);
		};

		exitBuild = (builder, direction) => {
			const sign = direction === 'forward' ? 1 : -1;
			builder.set('opacity', 1);
			builder.tween('x', -sign * distance, duration, ease);
			builder.tween('opacity', 0, duration, ease);
		};

		if (enterBuild) {
			const temp = new TransitionBuilder(manager.transitionState);
			enterBuild(temp, manager.direction);
		}

		return this;
	};

	state.fadeTransition = function (opts?: { duration?: number; ease?: Easing }) {
		const duration = opts?.duration ?? 0.5;
		const ease = opts?.ease ?? easeInOut;

		enterBuild = (builder) => {
			builder.set('opacity', 0);
			builder.tween('opacity', 1, duration, ease);
		};

		exitBuild = (builder) => {
			builder.set('opacity', 1);
			builder.tween('opacity', 0, duration, ease);
		};

		if (enterBuild) {
			const temp = new TransitionBuilder(manager.transitionState);
			enterBuild(temp, manager.direction);
		}

		return this;
	};

	state.zoomTransition = function (opts?: { duration?: number; ease?: Easing; scale?: number }) {
		const duration = opts?.duration ?? 0.5;
		const ease = opts?.ease ?? easeInOut;
		const scale = opts?.scale ?? 0.5;

		enterBuild = (builder) => {
			builder.set('opacity', 0);
			builder.set('scale', scale);
			builder.tween('opacity', 1, duration, ease);
			builder.tween('scale', 1, duration, ease);
		};

		exitBuild = (builder) => {
			builder.set('opacity', 1);
			builder.set('scale', 1);
			builder.tween('scale', scale, duration, ease);
			builder.tween('opacity', 0, duration, ease);
		};

		if (enterBuild) {
			const temp = new TransitionBuilder(manager.transitionState);
			enterBuild(temp, manager.direction);
		}

		return this;
	};

	state.codeTo = function (
		this: Scene<T>,
		code: string,
		duration = 0.6,
		opts?: { language?: string; ease?: Easing }
	) {
		if (!codeState) throw new Error('codeTo: no code state. Pass initial `code` to createScene().');
		const lang = opts?.language ?? codeState.language;
		if (opts?.language) void registerLanguages([opts.language]);
		steps.push(
			new CodeStep(
				codeState,
				() => ({
					from: makeCodeTree(codeState.resolved),
					to: makeCodeTree(applyIndent(code)),
					resolved: applyIndent(code)
				}),
				duration,
				opts?.ease ?? easeInOut,
				lang
			)
		);
		return this;
	};

	state.codeAppend = function (
		this: Scene<T>,
		code: string,
		duration = 0.6,
		ease: Easing = easeInOut
	) {
		if (!codeState)
			throw new Error('codeAppend: no code state. Pass initial `code` to createScene().');
		steps.push(
			new CodeStep(
				codeState,
				() => {
					const resolved = applyIndent(codeState.resolved + code);
					return {
						from: makeCodeTree(codeState.resolved),
						to: makeCodeTree(resolved),
						resolved
					};
				},
				duration,
				ease
			)
		);
		return this;
	};

	state.codePrepend = function (
		this: Scene<T>,
		code: string,
		duration = 0.6,
		ease: Easing = easeInOut
	) {
		if (!codeState)
			throw new Error('codePrepend: no code state. Pass initial `code` to createScene().');
		steps.push(
			new CodeStep(
				codeState,
				() => {
					const resolved = applyIndent(code + codeState.resolved);
					return {
						from: makeCodeTree(codeState.resolved),
						to: makeCodeTree(resolved),
						resolved
					};
				},
				duration,
				ease
			)
		);
		return this;
	};

	state.codeInsert = function (
		this: Scene<T>,
		anchor: CodeRange | CodeRange[] | RangeResolver,
		text: string,
		duration = 0.6,
		ease: Easing = easeInOut
	) {
		if (!codeState)
			throw new Error('codeInsert: no code state. Pass initial `code` to createScene().');
		steps.push(
			new CodeStep(
				codeState,
				() => {
					const current = codeState.resolved;
					const range = resolveSingleRange(anchor, current);
					const { start } = rangeToSplice(current, range);
					const result = applyIndent(current.slice(0, start) + text + current.slice(start));
					return {
						from: makeCodeTree(current),
						to: makeCodeTree(result),
						resolved: result
					};
				},
				duration,
				ease
			)
		);
		return this;
	};

	state.codeReplace = function (
		this: Scene<T>,
		target: CodeRange | CodeRange[] | RangeResolver,
		text: string,
		duration = 0.6,
		ease: Easing = easeInOut
	) {
		if (!codeState)
			throw new Error('codeReplace: no code state. Pass initial `code` to createScene().');
		steps.push(
			new CodeStep(
				codeState,
				() => {
					const current = codeState.resolved;
					const range = resolveSingleRange(target, current);
					const { start, end } = rangeToSplice(current, range);
					const result = applyIndent(current.slice(0, start) + text + current.slice(end));
					return {
						from: makeCodeTree(current),
						to: makeCodeTree(result),
						resolved: result
					};
				},
				duration,
				ease
			)
		);
		return this;
	};

	state.codeRemove = function (
		this: Scene<T>,
		target: CodeRange | CodeRange[] | RangeResolver,
		duration = 0.6,
		ease: Easing = easeInOut
	) {
		if (!codeState)
			throw new Error('codeRemove: no code state. Pass initial `code` to createScene().');
		steps.push(
			new CodeStep(
				codeState,
				() => {
					const current = codeState.resolved;
					const range = resolveSingleRange(target, current);
					const { start, end } = rangeToSplice(current, range);
					const result = applyIndent(current.slice(0, start) + current.slice(end));
					return {
						from: makeCodeTree(current),
						to: makeCodeTree(result),
						resolved: result
					};
				},
				duration,
				ease
			)
		);
		return this;
	};

	state.codeEdit = function (this: Scene<T>, duration = 0.6) {
		if (!codeState)
			throw new Error('codeEdit: no code state. Pass initial `code` to createScene().');
		return (strings: TemplateStringsArray, ...tags: (string | RawCodeFragment)[]) => {
			steps.push(
				new CodeStep(
					codeState,
					() => {
						const { to } = buildEditTrees(strings, tags);
						const resolved = applyIndent(to);
						return { from: codeState.resolved, to: resolved, resolved };
					},
					duration,
					easeInOut
				)
			);
			return this;
		};
	};

	state.codeSelection = function (
		this: Scene<T>,
		range: CodeRange | CodeRange[] | RangeResolver | string | typeof DEFAULT = DEFAULT,
		duration = 0.6
	) {
		if (!codeState)
			throw new Error('codeSelection: no code state. Pass initial `code` to createScene().');
		const resolvedRanges =
			range === DEFAULT ? ALL_LINES : resolveRangeArray(range, codeState.resolved);
		steps.push(new SelectionStep(codeState, resolvedRanges, duration));
		return this;
	};

	onMount(() => {
		manager.load({ steps, enterBuild, exitBuild, id: getSceneId()?.() });
	});

	return state;
}

function rangeToSplice(code: string, range: CodeRange): { start: number; end: number } {
	const [[sl, sc], [el, ec]] = range;
	const lines = code.split('\n');
	let start = 0;
	for (let i = 0; i < Math.min(sl, lines.length); i++) {
		start += lines[i].length + 1;
	}
	start += Math.min(sc, lines[Math.min(sl, lines.length - 1)]?.length ?? 0);
	let end = 0;
	for (let i = 0; i < Math.min(el, lines.length); i++) {
		end += lines[i].length + 1;
	}
	end +=
		ec === Infinity
			? (lines[Math.min(el, lines.length - 1)]?.length ?? Infinity)
			: Math.min(ec, lines[Math.min(el, lines.length - 1)]?.length ?? 0);
	return { start, end };
}
