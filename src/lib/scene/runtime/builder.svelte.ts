import { onMount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
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
import { CameraStep, type CameraOptions, type CameraTarget } from '../camera/steps';
import { getSceneManager, getSceneId } from './context.svelte';
import { TransitionBuilder, type TransitionBuild } from './runtime.svelte';
import { clamp, easeInOut, type Easing } from '../easing';
import { getOptions, type TransitionConfig } from '../options';
import { registerLanguages } from '../code/highlighter';
import {
	setCodeStates,
	createCodeState,
	buildEditTrees,
	makeCodeTree,
	resolveSingleRange,
	smartIndent,
	DEFAULT,
	type CodeBlockInput,
	type CodeState,
	type CodeRange,
	type RangeResolver,
	type RawCodeFragment
} from '../code/code.svelte';
import type { Camera } from '../camera/frame';

/**
 * The chainable scene builder returned by {@link createScene}. Step methods
 * append a step and return the builder for chaining; `transition*` methods
 * configure the enter/exit transitions instead. Steps play in the order they
 * were added; `duration` defaults are in seconds.
 */
export interface SceneBuilder<T> {
	/** The 0-based index of the current step. Read-only, driven by the timeline. */
	readonly step: number;
	/** Progress 0..1 through the current step; 1 while paused on a completed step. */
	readonly progress: number;
	tween(key: keyof T, to: number, duration?: number, ease?: Easing): this;
	tick(onTick: (frame: TickFrame) => void, duration?: number, ease?: Easing): this;
	wait(seconds?: number): this;
	layout(change: (scene: Scene<T>) => void, duration?: number, options?: LayoutOptions): this;
	all(fn: (scene: this) => void): this;
	repeat(count: number, fn: (scene: this, index: number) => void): this;
	transitionIn(fn: TransitionBuild): this;
	transitionOut(fn: TransitionBuild): this;
	noTransition(): this;
	slideTransition(opts?: { duration?: number; ease?: Easing; distance?: number }): this;
	fadeTransition(opts?: { duration?: number; ease?: Easing }): this;
	zoomTransition(opts?: { duration?: number; ease?: Easing; scale?: number }): this;
	/**
	 * Selects the named code block for the following `code*` steps. Returns
	 * the scene so calls chain across blocks without storing handles.
	 *
	 * @throws if the block name was not passed in `createScene({ code })`
	 */
	codeBlock(name?: string): this;
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
	/**
	 * Returns `(index) => opacity` for a sequentially-revealed list: item `i`
	 * fades in as its step plays and earlier items stay visible. `lead = 1`
	 * pre-reveals item 0 (visible before the first step plays).
	 */
	reveal(lead?: number): (index: number) => number;
	/**
	 * Crossfades through `items`, one per step: the current item fades out, the
	 * next swaps in at the step's invisible midpoint, and fades in. Use with
	 * `repeat(items.length - 1)` so the last item ends the scene.
	 */
	crossfade<U>(items: readonly U[]): { index: number; item: U; opacity: number };
	/**
	 * Flies the camera to a framed element (a `data-frame` id) or to canvas
	 * coordinates, keeping whatever `zoom`/`deg` the options leave out.
	 */
	frame(target?: CameraTarget, options?: CameraOptions): this;
	/** The scene's built-in camera. Initial values come from `createScene({ camera })`. */
	readonly camera: Camera;
}
type Scene<T> = T & SceneBuilder<T>;
type Object = Record<string, unknown>;

/**
 * Creates a reactive scene state object extended with the chainable step
 * builder. A copy of `initial` becomes the scene's reactive state; the
 * returned object carries both the state fields and the builder methods.
 *
 * Pass `code` (and optionally `language`) in `initial` to back `<Code>`
 * components with code morphing steps. `code` accepts a string for a single
 * `default` block or an object map of block name to source for multiple
 * blocks. A special `indent` field sets the re-indentation unit (default
 * `'  '`) and is removed from the state. The read-only `step` (current step
 * index) and `progress` (0..1 through it) are reserved and always driven by
 * the timeline.
 *
 * Must run during a component's setup so the scene manager context (from
 * `<Scenes>`) is available. Steps are loaded into the manager on mount.
 */
export function createScene<T extends Object>(initial: T = {} as T) {
	/*
		The caller's object is never mutated. `indent` is stripped and the
		read-only timeline getters are installed on a copy, so the same
		initial state can back multiple scenes and frozen objects keep working
	*/
	const rawInitial = { ...initial } as Record<string, unknown>;
	const indent =
		typeof rawInitial.indent === 'string' && rawInitial.indent.length > 0
			? rawInitial.indent
			: '  ';
	delete rawInitial.indent;
	if (
		'camera' in initial &&
		(typeof rawInitial.camera !== 'object' ||
			rawInitial.camera === null ||
			Array.isArray(rawInitial.camera))
	) {
		throw new Error('createScene: `camera` must be an object.');
	}
	const manager = getSceneManager();

	// `step`/`progress` are read-only views of the timeline, not scene state
	// the getters must live on the raw object before `$state` proxies it, because the proxy rejects accessor descriptors
	if ('step' in initial || 'progress' in initial) {
		throw new Error('createScene: `step` and `progress` are reserved scene fields.');
	}
	Object.defineProperty(rawInitial, 'step', {
		enumerable: false,
		configurable: true,
		get: () => manager.step
	});
	Object.defineProperty(rawInitial, 'progress', {
		enumerable: false,
		configurable: true,
		get: () => manager.stepProgress
	});

	/*
		The camera is ordinary scene state with defaults, so scenes that never
		mention it still render centered at zoom 1.
	*/
	rawInitial.camera = {
		x: 0,
		y: 0,
		zoom: 1,
		deg: 0,
		...((rawInitial.camera as Partial<Camera> | undefined) ?? {})
	};

	const state = $state(rawInitial) as Scene<T>;
	let steps: Step[] = [];
	let holdBeforeFirstStep = 0;
	let enterBuild: TransitionBuild | null = null;
	let exitBuild: TransitionBuild | null = null;

	const codeStates = new SvelteMap<string, CodeState>();
	let currentCodeName = 'default';
	const initialCode = rawInitial.code as unknown;
	const initialLanguage = rawInitial.language as string | undefined;
	if (initialLanguage) registerLanguages([initialLanguage]);
	if (typeof initialCode === 'string') {
		codeStates.set(
			'default',
			createCodeState(initialLanguage ?? 'ts', smartIndent(initialCode, indent))
		);
	} else if (initialCode !== undefined && initialCode !== null) {
		if (typeof initialCode !== 'object' || Array.isArray(initialCode)) {
			throw new Error(
				'createScene: `code` must be a string or an object map of block name to code.'
			);
		}
		const entries = Object.entries(initialCode as Record<string, CodeBlockInput>);
		const blockLanguages: string[] = [];
		for (const [name, input] of entries) {
			let source: string;
			let language = initialLanguage ?? 'ts';
			if (typeof input === 'string') {
				source = input;
			} else if (input && typeof input === 'object' && typeof input.code === 'string') {
				source = input.code;
				if (typeof input.language === 'string' && input.language.length > 0) {
					language = input.language;
				}
			} else {
				throw new Error(
					`createScene: code block "${name}" must be a string or { code, language }.`
				);
			}
			blockLanguages.push(language);
			codeStates.set(name, createCodeState(language, smartIndent(source, indent)));
		}
		if (blockLanguages.length > 0) registerLanguages(blockLanguages);
	}
	if (codeStates.size > 0) setCodeStates(codeStates);

	function availableBlocks(): string {
		return [...codeStates.keys()].join(', ') || '(none)';
	}

	function requireCodeState(): CodeState {
		const target = codeStates.get(currentCodeName);
		if (!target) {
			throw new Error(
				`no code block selected. Call .codeBlock(name) first. Available: ${availableBlocks()}.`
			);
		}
		return target;
	}

	function applyIndent(code: string): string {
		return smartIndent(code, indent);
	}

	/** Tweens state field `key` to `to` over `duration` seconds. */
	state.tween = function (key: string, to: number, duration = 0.5, ease: Easing = easeInOut) {
		steps.push(new TweenStep(state, key, to, duration, ease));
		return this;
	};

	/**
	 * Runs `onTick` every frame for `duration` seconds, receiving the
	 * per-frame {@link TickFrame}.
	 */
	state.tick = function (
		onTick: (frame: TickFrame) => void,
		duration = 0.5,
		ease: Easing = (p) => p
	) {
		steps.push(new TickStep(onTick, duration, ease));
		return this;
	};

	/**
	 * Keeps the previous step's finished frame on screen for `seconds`
	 * longer. Waits aren't steps: they don't show up in `step` or
	 * `totalSteps`, and the live player skips them. As the first call, a
	 * wait keeps the scene's first frame up until the first step starts.
	 */
	state.wait = function (seconds = 1) {
		const last = steps.at(-1);
		if (!last) {
			holdBeforeFirstStep += seconds;
		} else {
			last.wait = (last.wait ?? 0) + seconds;
		}
		return this;
	};

	/**
	 * Returns `(index) => opacity` for a sequentially-revealed list. Reading
	 * `step`/`progress` through the closure keeps the returned function
	 * reactive in markup.
	 */
	state.reveal = function (lead = 0) {
		return (index: number) => clamp(state.step + state.progress + lead - index, 0, 1);
	};

	/**
	 * Reactive view of a crossfade through `items`, one item per step. The
	 * getters read `step`/`progress` lazily, so the returned object works
	 * directly in markup like `step`/`progress` do.
	 */
	state.crossfade = function <U>(items: readonly U[]) {
		return {
			get index() {
				return state.step + Math.round(state.progress);
			},
			get item() {
				return items[state.step + Math.round(state.progress)];
			},
			get opacity() {
				return Math.abs(state.progress * 2 - 1);
			}
		};
	};

	/**
	 * Animates a DOM change with a FLIP transition: snapshots every element
	 * tagged with a `data-layout` key, runs `change`, then animates retained,
	 * added, and removed elements per the `enter`/`exit` {@link LayoutOptions}.
	 * Only one layout step may run at a time.
	 */
	state.layout = function (
		change: (scene: Scene<T>) => void,
		duration = 0.5,
		options: LayoutOptions = {}
	) {
		steps.push(new LayoutStep(state, () => change(state), duration, options));
		return this;
	};

	/** Runs every step added inside `fn` in parallel as a single step. At most one of them may be a layout step. */
	state.all = function (this: Scene<T>, fn: (scene: Scene<T>) => void) {
		const saved = steps;
		const parallelSteps: Step[] = [];
		steps = parallelSteps;
		fn(this);
		steps = saved;
		steps.push(new ParallelStep(parallelSteps));
		return this;
	};

	/**
	 * Runs `fn` `count` times so a block of steps can be added repeatedly
	 * without repeating the builder calls by hand. `index` is the current
	 * repetition, which lets each pass vary its steps.
	 */
	state.repeat = function (
		this: Scene<T>,
		count: number,
		fn: (scene: Scene<T>, index: number) => void
	) {
		if (!Number.isInteger(count) || count < 0) {
			throw new RangeError('repeat count must be a non-negative integer.');
		}
		for (let i = 0; i < count; i++) {
			fn(this, i);
		}
		return this;
	};

	function applyTransition(enter: TransitionBuild | null, exit: TransitionBuild | null) {
		if (enter) enterBuild = enter;
		if (exit) exitBuild = exit;
		if (enterBuild) {
			const temp = new TransitionBuilder(manager.transitionState);
			enterBuild(temp, manager.direction);
		}
	}

	/** Replaces the enter transition build. */
	state.transitionIn = function (fn: TransitionBuild) {
		applyTransition(fn, null);
		return this;
	};

	/** Replaces the exit transition build. */
	state.transitionOut = function (fn: TransitionBuild) {
		exitBuild = fn;
		return this;
	};

	/** Disables both enter and exit transitions. */
	state.noTransition = function () {
		enterBuild = null;
		exitBuild = null;
		return this;
	};

	/** Sets a direction-aware horizontal slide transition. */
	state.slideTransition = function (opts?: {
		duration?: number;
		ease?: Easing;
		distance?: number;
	}) {
		const { enter, exit } = buildSlide(
			opts?.duration ?? 0.5,
			opts?.ease ?? easeInOut,
			opts?.distance ?? 100
		);
		applyTransition(enter, exit);
		return this;
	};

	state.fadeTransition = function (opts?: { duration?: number; ease?: Easing }) {
		const { enter, exit } = buildFade(opts?.duration ?? 0.5, opts?.ease ?? easeInOut);
		applyTransition(enter, exit);
		return this;
	};

	/** Sets a scale-while-fading transition. */
	state.zoomTransition = function (opts?: { duration?: number; ease?: Easing; scale?: number }) {
		const { enter, exit } = buildZoom(
			opts?.duration ?? 0.5,
			opts?.ease ?? easeInOut,
			opts?.scale ?? 0.5
		);
		applyTransition(enter, exit);
		return this;
	};

	/**
	 * Selects the named code block for the following `code*` steps. With no
	 * argument selects the single `default` block.
	 *
	 * @throws if the block name was not passed in `createScene({ code })`
	 */
	state.codeBlock = function (this: Scene<T>, name = 'default') {
		if (!codeStates.has(name)) {
			throw new Error(`codeBlock: unknown code block "${name}". Available: ${availableBlocks()}.`);
		}
		currentCodeName = name;
		return this;
	};

	/**
	 * Morphs the whole code block to `code`. Re-indents the target with the
	 * scene's indent unit.
	 *
	 * @throws if the scene was created without initial `code`
	 */
	state.codeTo = function (
		this: Scene<T>,
		code: string,
		duration = 0.6,
		opts?: { language?: string; ease?: Easing }
	) {
		const target = requireCodeState();
		const lang = opts?.language ?? target.language;
		if (opts?.language) registerLanguages([opts.language]);
		steps.push(
			new CodeStep(
				target,
				() => ({
					from: makeCodeTree(target.resolved),
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

	/** Appends `code` to the end of the code block. */
	state.codeAppend = function (
		this: Scene<T>,
		code: string,
		duration = 0.6,
		ease: Easing = easeInOut
	) {
		const target = requireCodeState();
		steps.push(
			new CodeStep(
				target,
				() => {
					const resolved = applyIndent(target.resolved + code);
					return {
						from: makeCodeTree(target.resolved),
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

	/** Prepends `code` to the start of the code block. */
	state.codePrepend = function (
		this: Scene<T>,
		code: string,
		duration = 0.6,
		ease: Easing = easeInOut
	) {
		const target = requireCodeState();
		steps.push(
			new CodeStep(
				target,
				() => {
					const resolved = applyIndent(code + target.resolved);
					return {
						from: makeCodeTree(target.resolved),
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

	/**
	 * Inserts `text` at the start of `anchor`'s range. `anchor` may be a range
	 * array, a range, or a resolver like `code.FIRST(...)`.
	 */
	state.codeInsert = function (
		this: Scene<T>,
		anchor: CodeRange | CodeRange[] | RangeResolver,
		text: string,
		duration = 0.6,
		ease: Easing = easeInOut
	) {
		const target = requireCodeState();
		steps.push(
			new CodeStep(
				target,
				() => {
					const current = target.resolved;
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

	/**
	 * Replaces `target`'s range with `text`. A plain string `target` matches
	 * its first occurrence in the code.
	 */
	state.codeReplace = function (
		this: Scene<T>,
		target: CodeRange | CodeRange[] | RangeResolver | string,
		text: string,
		duration = 0.6,
		ease: Easing = easeInOut
	) {
		const block = requireCodeState();
		steps.push(
			new CodeStep(
				block,
				() => {
					const current = block.resolved;
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

	/** Deletes `target`'s range. A plain string `target` matches its first occurrence. */
	state.codeRemove = function (
		this: Scene<T>,
		target: CodeRange | CodeRange[] | RangeResolver | string,
		duration = 0.6,
		ease: Easing = easeInOut
	) {
		const block = requireCodeState();
		steps.push(
			new CodeStep(
				block,
				() => {
					const current = block.resolved;
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

	/**
	 * Returns a tagged-template function that morphs the code using inline
	 * `code.insert`/`code.remove`/`code.replace` fragments.
	 *
	 * @example
	 * scene.codeEdit(0.6)`return ${code.insert('result;')};`;
	 */
	state.codeEdit = function (this: Scene<T>, duration = 0.6) {
		const target = requireCodeState();
		return (strings: TemplateStringsArray, ...tags: (string | RawCodeFragment)[]) => {
			steps.push(
				new CodeStep(
					target,
					() => {
						const { to } = buildEditTrees(strings, tags);
						const resolved = applyIndent(to);
						return { from: target.resolved, to: resolved, resolved };
					},
					duration,
					easeInOut
				)
			);
			return this;
		};
	};

	/**
	 * Highlights the selection: dims code outside `range`. With no argument,
	 * selects the whole block.
	 */
	state.codeSelection = function (
		this: Scene<T>,
		range: CodeRange | CodeRange[] | RangeResolver | string | typeof DEFAULT = DEFAULT,
		duration = 0.6
	) {
		steps.push(new SelectionStep(requireCodeState(), range, duration));
		return this;
	};

	/**
	 * Flies the camera to a framed element or to canvas coordinates. The
	 * destination is measured when the step starts, so it frames the element
	 * wherever it actually sits at that point in the timeline.
	 */
	state.frame = function (target: CameraTarget = {}, options: CameraOptions = {}) {
		steps.push(new CameraStep(state.camera as Camera, target, options));
		return this;
	};

	const defaultTransition = getOptions().transition;
	if (defaultTransition) {
		const { enter, exit } = buildFromConfig(defaultTransition);
		applyTransition(enter, exit);
	}

	onMount(() => {
		manager.load({
			steps,
			holdBeforeFirstStep,
			enterBuild,
			exitBuild,
			id: getSceneId()?.()
		});
	});

	return state;
}

function buildSlide(
	duration: number,
	ease: Easing,
	distance: number
): {
	enter: TransitionBuild;
	exit: TransitionBuild;
} {
	return {
		enter: (builder, direction) => {
			const sign = direction === 'forward' ? 1 : -1;
			builder.set('x', sign * distance);
			builder.set('opacity', 0);
			builder.tween('x', 0, duration, ease);
			builder.tween('opacity', 1, duration, ease);
		},
		exit: (builder, direction) => {
			const sign = direction === 'forward' ? 1 : -1;
			builder.set('opacity', 1);
			builder.tween('x', -sign * distance, duration, ease);
			builder.tween('opacity', 0, duration, ease);
		}
	};
}

function buildFade(
	duration: number,
	ease: Easing
): {
	enter: TransitionBuild;
	exit: TransitionBuild;
} {
	return {
		enter: (builder) => {
			builder.set('opacity', 0);
			builder.tween('opacity', 1, duration, ease);
		},
		exit: (builder) => {
			builder.set('opacity', 1);
			builder.tween('opacity', 0, duration, ease);
		}
	};
}

function buildZoom(
	duration: number,
	ease: Easing,
	scale: number
): {
	enter: TransitionBuild;
	exit: TransitionBuild;
} {
	return {
		enter: (builder) => {
			builder.set('opacity', 0);
			builder.set('scale', scale);
			builder.tween('opacity', 1, duration, ease);
			builder.tween('scale', 1, duration, ease);
		},
		exit: (builder) => {
			builder.set('opacity', 1);
			builder.set('scale', 1);
			builder.tween('scale', scale, duration, ease);
			builder.tween('opacity', 0, duration, ease);
		}
	};
}

function buildFromConfig(config: TransitionConfig): {
	enter: TransitionBuild;
	exit: TransitionBuild;
} {
	const duration = config.duration ?? 0.5;
	const ease = config.ease ?? easeInOut;
	switch (config.type) {
		case 'slide':
			return buildSlide(duration, ease, config.distance ?? 100);
		case 'fade':
			return buildFade(duration, ease);
		case 'zoom':
			return buildZoom(duration, ease, config.scale ?? 0.5);
	}
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
