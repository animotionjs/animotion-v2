import { flushSync } from 'svelte';
import {
	ALL_LINES,
	DEFAULT,
	resolveRangeArray,
	type CodeRange,
	type CodeState,
	type RangeResolver
} from '../code/code.svelte';
import {
	diffStrings,
	highlight,
	isHighlighterReady,
	onHighlighterReady,
	onHighlighterRefresh,
	type MorphToken,
	type PositionedToken
} from '../code/highlighter';
import { clamp, clampRemap, easeInOut, lerp, type Easing } from '../easing';

/**
 * A single animation unit. A scene's chain of steps plays sequentially;
 * `duration` is in seconds. `progress` values passed to `setProgress` are
 * normalized `0..1`.
 */
export interface Step {
	readonly duration: number;
	setProgress(p: number): void;
	start(): void;
	end(): void;
	revert(): void;
}

/**
 * Eases a single numeric field of a state object toward a target value.
 * `start()` snapshots the field's current value as the `from` point; `revert()`
 * restores that snapshot.
 */
export class TweenStep implements Step {
	#state: Record<string, unknown>;
	#key: string;
	#to: number;
	#duration: number;
	#ease: Easing;
	#from = 0;
	#started = false;

	constructor(
		state: Record<string, unknown>,
		key: string,
		to: number,
		duration: number,
		ease: Easing = easeInOut
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
		this.#started = true;
		this.#from = this.#state[this.#key] as number;
	}

	end() {
		// Committing an un-started step would clobber the scene's initial value
		// with the target; only end steps that actually played.
		if (!this.#started) return;
		this.#state[this.#key] = this.#to;
	}

	revert() {
		// An un-started step has no `from` snapshot (it still holds the field
		// default), so reverting it would reset a non-zero initial value. This
		// mirrors the `#snapshot` guard on `CodeStep`/`SelectionStep`.
		if (!this.#started) return;
		this.#started = false;
		this.#state[this.#key] = this.#from;
	}
}

/** Per-frame data passed to a `tick` callback. */
export interface TickFrame {
	/** eased progress 0..1 within this step */
	progress: number;
	/** linear seconds elapsed within this step (0..duration) */
	time: number;
	/** seconds since this step's previous frame */
	deltaTime: number;
	/** number of frames rendered for this step */
	frame: number;
}

/**
 * Runs `onTick` every frame while the step plays. Drives arbitrary state from
 * the step's progress; see {@link TickFrame} for the per-frame payload.
 */
export class TickStep implements Step {
	#onTick: (frame: TickFrame) => void;
	#duration: number;
	#ease: Easing;
	#time = 0;
	#frame = 0;

	constructor(onTick: (frame: TickFrame) => void, duration: number, ease: Easing = (p) => p) {
		this.#onTick = onTick;
		this.#duration = duration;
		this.#ease = ease;
	}

	get duration(): number {
		return this.#duration;
	}

	start() {
		this.#time = 0;
		this.#frame = 0;
	}

	setProgress(p: number) {
		const time = clamp(p, 0, 1) * this.#duration;
		this.#frame++;
		this.#onTick({
			progress: this.#ease(clamp(p, 0, 1)),
			time,
			deltaTime: time - this.#time,
			frame: this.#frame
		});
		this.#time = time;
	}

	end() {}

	revert() {
		this.#onTick({ progress: 0, time: 0, deltaTime: 0, frame: 0 });
		this.#time = 0;
		this.#frame = 0;
	}
}

/** Holds the current frame for `seconds`; nothing animates while it plays. */
export class WaitStep implements Step {
	#duration: number;

	constructor(duration: number) {
		this.#duration = duration;
	}

	get duration(): number {
		return this.#duration;
	}

	setProgress(p: number) {
		void p;
	}
	start() {}
	end() {}
	revert() {}
}

/** Visual transition applied to entering/exiting `data-layout` elements. */
export type LayoutTransition =
	| 'fade'
	| 'scale'
	| 'clip'
	| 'wipe'
	| 'slide'
	| 'none'
	| ((p: number, direction: 'enter' | 'exit', el: HTMLElement) => LayoutTransitionValue);

/**
 * The per-frame styles a layout transition yields, keyed by progress `p`
 * (already eased and stagger/enter-end remapped). Returned by both the
 * built-in transitions and custom function transitions.
 */
export interface LayoutTransitionValue {
	opacity?: number;
	transform?: string;
	clipPath?: string;
	/** The transform pivot; only honored when returned by a custom transition. */
	transformOrigin?: string;
	/** The standalone `rotate` property, composed with `transform` by CSS. */
	rotate?: string;
	/** The standalone `scale` property, composed with `transform` by CSS. */
	scale?: string;
	/** The standalone `translate` property, composed with `transform` by CSS. */
	translate?: string;
}

/**
 * Enter/exit transitions for {@link LayoutStep}. Unset options default to
 * `'fade'`; `'none'` skips the exit animation entirely (removed elements
 * disappear instantly).
 */
export interface LayoutOptions {
	/** How newly added elements animate in. Defaults to `'fade'`. */
	enter?: LayoutTransition;
	/** How removed elements animate out. Defaults to `'fade'`; `'none'` skips it. */
	exit?: LayoutTransition;
	/** Easing applied to every tween in the step. Defaults to `easeInOut`. */
	ease?: Easing;
	/**
	 * Morph size changes with `transform: scale` instead of `width`/`height`.
	 * Scale stays on the compositor and never triggers layout, so the motion
	 * is smooth and the endpoint is pixel-perfect by construction, but glyphs
	 * rasterize at a changing scale (soft mid-flight). `width`/`height`
	 * re-lays-out every frame — keeping text and images crisp — at the cost
	 * of per-frame re-layout. Defaults to `true`.
	 */
	scale?: boolean;
	/**
	 * The fraction of the step by which the enter transition completes.
	 * Defaults to `1` (the full step, as the layout settles).
	 */
	enterEnd?: number;
	/**
	 * The fraction of the step by which the exit transition completes.
	 * Removed elements finish leaving by the step's end. Defaults to `1`.
	 */
	exitEnd?: number;
	/**
	 * The fraction of the step between successive entering/exiting elements'
	 * start times. Element `i` begins its transition at `stagger * i`, so a
	 * batch added or removed together animates one after another. The step
	 * duration stays fixed (later elements compress); elements whose delay
	 * reaches the transition's end render the fully-transitioned state.
	 * Defaults to `0` (no stagger).
	 */
	stagger?: number;
}

const DEFAULT_ENTER: LayoutTransition = 'fade';
const DEFAULT_EXIT: LayoutTransition = 'fade';

/** The ancestor's scale to cancel, and the element's final local spot. */
type ParentScale = {
	x0: number;
	y0: number;
	x: number;
	y: number;
	/** The ancestor's FLIP offset (previous minus final local position), so entering children can cancel its motion. */
	dx0: number;
	dy0: number;
};

/**
 * A retained element: pinned at its final bounds and glided via transforms.
 * `localFinal` is always present — every flip tween is pinned — so the
 * ancestor-scale counter needs no `!` to read it.
 */
interface FlipTween {
	el: HTMLElement;
	mode: 'flip';
	transition: 'none';
	/** changed visual properties, each lerped by progress */
	props: LayoutPropTween[];
	/**
	 * The position offset (previous minus final local position). Pinned at its
	 * final bounds, the element is transformed back to its previous spot and
	 * glides forward; a transform keeps the motion at float precision instead
	 * of stepping through device pixels like left/top.
	 */
	offset?: { x: number; y: number };
	/**
	 * (`scale: false`): the box's previous and final bounds, lerped as
	 * `width`/`height` so nested text and images rasterize at native size.
	 */
	size?: { fromW: number; fromH: number; toW: number; toH: number };
	/**
	 * Present when the element morphs between sizes; `x`/`y` track the current
	 * frame's scale so the border-radius can be counter-scaled against it.
	 */
	scale?: { x0: number; y0: number; x: number; y: number };
	/**
	 * Present when the nearest `data-layout` ancestor morphs between sizes:
	 * the counter transform cancels the ancestor's scale so this element's
	 * content never stretches with it.
	 */
	parentScale?: ParentScale;
	/** this element's local left/top in the final layout, for the counter */
	localFinal: { x: number; y: number };
	/**
	 * The element's own transform tweened across the flip (present when either
	 * state has a transform); composed after the flip compensation and applied
	 * around the element's natural transform-origin.
	 */
	transform?: { from: TransformState; to: TransformState };
	/** The author's inline styles the step overwrites, restored on clear. */
	inline: LayoutInlineStyles;
}

/** A newly added element animating in with the enter transition. */
interface EnterTween {
	el: HTMLElement;
	mode: 'enter';
	transition: LayoutTransition;
	props: LayoutPropTween[];
	parentScale?: ParentScale;
	localFinal: { x: number; y: number };
	/** The element's 0-based position among the step's entering elements. */
	staggerIndex: number;
	/** The element's existing transform, wrapped to the animation's pivot. */
	base: string;
	/** The element's computed opacity; the transition composes with it. */
	baseOpacity: number;
	/** The author's inline styles the step overwrites, restored on clear. */
	inline: LayoutInlineStyles;
}

/**
 * A retained `data-layout` ancestor's FLIP motion that an exit ghost must
 * ride: the ancestor's previous-to-final offset and scale, its final origin,
 * and the ghost's offset from the ancestor's previous origin.
 */
type ExitAncestor = {
	/** The ancestor's previous-to-final layout offset in viewport pixels. */
	dx0: number;
	dy0: number;
	/** The ancestor's previous-to-final scale; 1 when it doesn't morph size. */
	x0: number;
	y0: number;
	/** The ancestor's final layout origin. */
	left: number;
	top: number;
	/** The ghost's offset from the ancestor's previous origin, in that space. */
	local: { x: number; y: number };
	/**
	 * The ancestor's own transform, tweened across the step exactly like its
	 * flip so the ghost rotates/scales with it instead of freezing at its
	 * pre-change spot. Present only when the ancestor carries a transform.
	 */
	transform?: { from: TransformState; to: TransformState };
	/** The ancestor's transform-origin as an offset from its box's top-left. */
	origin: { x: number; y: number };
};

/** A removed element's fixed-position ghost animating out. */
interface ExitTween {
	el: HTMLElement;
	mode: 'exit';
	transition: LayoutTransition;
	props: LayoutPropTween[];
	/** The element's 0-based position among the step's exiting elements. */
	staggerIndex: number;
	/** The element's existing transform, wrapped to the animation's pivot. */
	base: string;
	/** The element's computed opacity; the transition composes with it. */
	baseOpacity: number;
	/** The author's inline styles the step overwrites, restored on clear. */
	inline: LayoutInlineStyles;
	/** The ghost's pinned fixed origin (its pre-change viewport spot). */
	fixed: { left: number; top: number };
	/**
	 * Present when the ghost's `data-layout` ancestor survives the change and
	 * FLIPs: the ancestor's motion the ghost must ride each frame, or the
	 * ghost freezes at its pre-change spot while the card shrinks out from
	 * under it.
	 */
	ancestor?: ExitAncestor;
}

type LayoutTween = FlipTween | EnterTween | ExitTween;

/** A single property interpolated between two computed values. */
interface LayoutPropTween {
	prop: string;
	from: number[];
	to: number[];
	format: (values: number[]) => string;
}

/** Interpolatable view of a computed style value. */
interface ParsedProp {
	/** per-component numeric values (e.g. RGBA channels or radius corners) */
	values: number[];
	/** unit shared by every component; '' for unitless values (opacity, colors) */
	unit: string;
	/** serializes interpolated values back into a CSS string */
	format: (values: number[]) => string;
}

function parseLength(value: string): ParsedProp | null {
	// Computed styles can serialize large lengths in scientific notation
	// (`rounded-full` resolves `calc(infinity * 1px)` to `3.35544e+07px`).
	const match = value.match(/^(-?[\d.]+(?:e[+-]?\d+)?)(px|%|em|rem|cqi|cqw|ch|vh|vw)$/i);
	if (!match) return null;
	const unit = match[2];
	return {
		values: [Number(match[1])],
		unit,
		format: (values) => `${values[0]}${unit}`
	};
}

/** Parses a color channel, mapping `%` to a 0-1 fraction. */
function channel(value: string): number {
	return value.endsWith('%') ? Number(value.slice(0, -1)) / 100 : Number(value);
}

/** Applies the sRGB transfer function and scales a channel to 0-255. */
function toSrgb(c: number): number {
	const v = Math.max(0, Math.min(1, c));
	return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
}

/** Converts OKLab coordinates (L in 0-1, a/b unbounded) to an sRGB triplet. */
function oklabToRgb(lightness: number, a: number, b: number): [number, number, number] {
	const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = lightness - 0.0894841775 * a - 1.291485548 * b;
	const l = l_ * l_ * l_;
	const m = m_ * m_ * m_;
	const s = s_ * s_ * s_;
	return [
		toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
	];
}

function colorProp(rgb: [number, number, number], alpha: number): ParsedProp {
	return {
		values: [rgb[0], rgb[1], rgb[2], alpha],
		unit: '',
		format: (values) => `rgba(${values[0]}, ${values[1]}, ${values[2]}, ${values[3]})`
	};
}

function parseColor(value: string): ParsedProp | null {
	let match = value.match(
		/^rgba?\(\s*([\d.]+)\s*[,/]\s*([\d.]+)\s*[,/]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/i
	);
	if (match) {
		const [, r, g, b, a] = match;
		return colorProp([Number(r), Number(g), Number(b)], a === undefined ? 1 : Number(a));
	}
	// Tailwind's palette is OKLCH and its opacity modifiers resolve to OKLab,
	// so both are normalized to sRGB before interpolating.
	match = value.match(
		/^oklch\(\s*(-?[\d.]+%?)\s+(-?[\d.]+%?)\s+(-?[\d.]+)\s*(?:\/\s*(-?[\d.]+%?)\s*)?\)$/i
	);
	if (match) {
		const [, l, c, h, a] = match;
		const hue = (Number(h) * Math.PI) / 180;
		const chroma = channel(c);
		return colorProp(
			oklabToRgb(channel(l), chroma * Math.cos(hue), chroma * Math.sin(hue)),
			a === undefined ? 1 : channel(a)
		);
	}
	match = value.match(
		/^oklab\(\s*(-?[\d.]+%?)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*(?:\/\s*(-?[\d.]+%?)\s*)?\)$/i
	);
	if (match) {
		const [, l, a_, b_, a] = match;
		return colorProp(
			oklabToRgb(channel(l), Number(a_), Number(b_)),
			a === undefined ? 1 : channel(a)
		);
	}
	return null;
}

function parseOpacity(value: string): ParsedProp | null {
	const opacity = Number(value);
	if (!Number.isFinite(opacity)) return null;
	return {
		values: [opacity],
		unit: '',
		format: (values) => `${values[0]}`
	};
}

function parseRadius(value: string): ParsedProp | null {
	const tokens = value.trim().split(/\s+/);
	// Elliptical radii (e.g. `10px / 20px`) aren't interpolated.
	if (tokens.includes('/')) return null;
	const corners = tokens.map(parseLength);
	if (corners.some((corner) => corner === null)) return null;
	const unit = corners[0]!.unit;
	if (corners.some((corner) => corner!.unit !== unit)) return null;
	return {
		values: corners.map((corner) => corner!.values[0]),
		unit,
		format: (values) => values.map((corner) => `${corner}${unit}`).join(' ')
	};
}

/** Visual properties auto-tweened on retained elements when they change. */
const LAYOUT_PROPS: Record<string, (value: string) => ParsedProp | null> = {
	'background-color': parseColor,
	color: parseColor,
	'border-color': parseColor,
	opacity: parseOpacity,
	'border-radius': parseRadius
};

/** Captures the tweenable properties of an element for later comparison. */
function snapshotLayoutStyles(el: HTMLElement): Record<string, string> {
	const computed = getComputedStyle(el);
	const styles: Record<string, string> = {};
	for (const prop of Object.keys(LAYOUT_PROPS)) {
		styles[prop] = computed.getPropertyValue(prop);
	}
	return styles;
}

/**
 * The resolved text metrics an exit ghost needs to render identically outside
 * the element's flow context (see {@link LayoutStep.#createGhost}).
 */
interface LayoutTextMetrics {
	fontFamily: string;
	fontSize: string;
	fontWeight: string;
	fontStyle: string;
	fontVariant: string;
	lineHeight: string;
	letterSpacing: string;
	wordSpacing: string;
	/**
	 * The resolved color, pinned so a ghost's `currentColor`-dependent
	 * presentation (SVG strokes, borders) survives the move to `<body>`,
	 * where it would otherwise inherit the body's color.
	 */
	color: string;
}

/** Measured state of one `data-layout` element in a step's two snapshots. */
interface LayoutBounds {
	el: HTMLElement;
	rect: DOMRect;
	styles: Record<string, string>;
	text: LayoutTextMetrics;
	/**
	 * The element's computed `display`. Exit ghosts clone the element and pin
	 * it `fixed`, and forcing `block` would break grid/flex centering of
	 * nested content (removed text jumping to the left edge).
	 */
	display: string;
	/** The computed border-top width; `'0px'` when the border isn't visible. */
	borderWidth: string;
	/** The element's computed opacity, so a transition can compose with it. */
	opacity: number;
	/** The element cloned before the step's change, so exit ghosts render the state being left. */
	clone?: HTMLElement;
	/**
	 * The text glyph ink position (Range over the contents), distinct from the
	 * layout box because the ink sits at a different offset within the box at
	 * different font sizes. Only present for direct-text elements.
	 */
	ink?: { left: number; top: number };
	/** The parsed computed `transform`, or `null` when the element has none. */
	matrix: Matrix2D | null;
	/** The element's computed transform-origin as an offset from its top-left. */
	origin: { x: number; y: number };
	/** Whether the element uses standalone `rotate`/`scale`/`translate` props. */
	individual: boolean;
	/** The element's untransformed layout box (`rect` for untransformed elements). */
	layout: { left: number; top: number; width: number; height: number };
}

/**
 * Captures the resolved text metrics. Must run while the element is still in
 * the DOM: computed styles on a detached node resolve `em`/container-based
 * sizes against the initial values instead of the element's ancestors.
 */
function snapshotTextMetrics(el: HTMLElement): LayoutTextMetrics {
	const computed = getComputedStyle(el);
	return {
		fontFamily: computed.fontFamily,
		fontSize: computed.fontSize,
		fontWeight: computed.fontWeight,
		fontStyle: computed.fontStyle,
		fontVariant: computed.fontVariant,
		lineHeight: computed.lineHeight,
		letterSpacing: computed.letterSpacing,
		wordSpacing: computed.wordSpacing,
		color: computed.color
	};
}

/** Whether the element's box is sized by its own text (direct text nodes). */
function hasDirectText(el: HTMLElement): boolean {
	return [...el.childNodes].some(
		(node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== ''
	);
}

/**
 * Whether a retained element's bounds change enough to need morphing.
 * transform-scale stretches an element's own text, so a box whose size change
 * comes from its content (a shrink-wrapped text run that becomes a full-width
 * block) is treated as position-only and glides crisply — unless the font-size
 * itself changed, in which case the text element scales its own glyphs (the one
 * way a text-size change animates) regardless of the `scale` option. Both boxes
 * are the untransformed layout boxes so an element's own rotation doesn't
 * inflate its measured size into a false scale.
 */
function morphsSize(
	prev: LayoutBounds,
	last: Pick<LayoutBounds, 'el' | 'layout' | 'text'>
): boolean {
	const fontChanged = prev.text.fontSize !== last.text.fontSize;
	return (
		(prev.layout.width !== last.layout.width || prev.layout.height !== last.layout.height) &&
		!(hasDirectText(last.el) && !fontChanged)
	);
}

/** Measures one `data-layout` element's state (box, transform, text, ink). */
function captureBounds(el: HTMLElement, rect: DOMRect): LayoutBounds {
	const computed = getComputedStyle(el);
	const width = el.offsetWidth || rect.width;
	const height = el.offsetHeight || rect.height;
	const individual = hasIndividualTransforms(el);
	const matrix = composeTransform(computed, individual, width, height);
	const origin = resolveOrigin(computed.transformOrigin, width, height);
	return {
		el,
		rect,
		matrix,
		origin,
		individual,
		layout: matrix
			? layoutRectOf(el, matrix, rect, origin)
			: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
		styles: snapshotLayoutStyles(el),
		text: snapshotTextMetrics(el),
		display: computed.display,
		borderWidth: computed.borderTopWidth,
		opacity: parseFloat(computed.opacity),
		ink: textInkRect(el)
	};
}

/**
 * The top-left of the element's text glyph ink, as opposed to its layout box.
 * Must run while the element is untransformed.
 */
function textInkRect(el: HTMLElement): { left: number; top: number } | undefined {
	if (!hasDirectText(el)) return undefined;
	const range = document.createRange();
	range.selectNodeContents(el);
	const rect = range.getBoundingClientRect();
	return rect.width > 0 && rect.height > 0 ? { left: rect.left, top: rect.top } : undefined;
}

function createLayoutPropTween(
	prop: string,
	fromValue: string,
	toValue: string,
	capPx?: number
): LayoutPropTween | null {
	const parser = LAYOUT_PROPS[prop];
	const from = parser(fromValue);
	const to = parser(toValue);
	if (!from || !to) return null;
	if (from.unit !== to.unit || from.values.length !== to.values.length) return null;
	if (from.values.every((value, i) => value === to.values[i])) return null;
	// Radiuses above the box's fully-round size (like `rounded-full`, which
	// resolves to an effectively-infinite value) render identically once CSS
	// clamps them, so capping there keeps the tween from jumping to a huge
	// number in the first frame and makes the morph visible instead.
	const cap = (values: number[]) =>
		capPx !== undefined && from.unit === 'px'
			? values.map((value) => Math.min(value, capPx))
			: values;
	return { prop, from: cap(from.values), to: cap(to.values), format: from.format };
}

/**
 * Serializes a pixel value at full precision. The FLIP pinning must match the
 * element's natural flow position exactly, or clearing the inline styles at
 * the end of the step would snap it by the rounding error.
 */
const px = (value: number) => `${value}px`;

function transitionValue(
	transition: LayoutTransition,
	p: number,
	direction: 'enter' | 'exit',
	el: HTMLElement
): LayoutTransitionValue {
	if (typeof transition === 'function') return transition(p, direction, el);
	switch (transition) {
		case 'fade':
			return { opacity: direction === 'enter' ? p : 1 - p };
		case 'scale':
			return { transform: `scale(${direction === 'enter' ? p : 1 - p})` };
		case 'clip': {
			const r = direction === 'enter' ? 100 * p : 100 * (1 - p);
			return { clipPath: `circle(${r}% at 50% 50%)` };
		}
		case 'wipe': {
			const side = direction === 'enter' ? 100 * (1 - p) : 100 * p;
			return { clipPath: `inset(0 ${side}% 0 0)` };
		}
		case 'slide': {
			const offset = direction === 'enter' ? 100 * (1 - p) : 100 * p;
			// Slide mostly into place first, then fade as the element settles,
			// so the text is still translucent while it enters.
			const fade = clampRemap(p, 0.4, 1, 0, 1);
			return {
				opacity: direction === 'enter' ? fade : 1 - fade,
				transform: `translateY(${offset}%)`
			};
		}
		case 'none':
			return {};
	}
}

/** The author's inline styles a step overwrites, restored on `end()`/`revert()`. */
interface LayoutInlineStyles {
	transform: string;
	clipPath: string;
	transformOrigin: string;
	rotate: string;
	scale: string;
	translate: string;
	/**
	 * The author's inline values of the auto-tweened visual props. A step only
	 * ever overrides these while it runs, so clearing them at the end would wipe
	 * author-set styles (e.g. a Svelte `style:background-color` directive);
	 * restoring them leaves each element exactly as it was found.
	 */
	layoutProps: Record<string, string>;
}

function snapshotInline(el: HTMLElement): LayoutInlineStyles {
	const inline: LayoutInlineStyles = {
		transform: el.style.transform,
		clipPath: el.style.clipPath,
		transformOrigin: el.style.transformOrigin,
		rotate: el.style.rotate,
		scale: el.style.scale,
		translate: el.style.translate,
		layoutProps: {}
	};
	for (const prop of Object.keys(LAYOUT_PROPS)) {
		inline.layoutProps[prop] = el.style.getPropertyValue(prop);
	}
	return inline;
}

/** The element's resolved `transform` matrix, or `''` when it has none. */
function computedTransformOf(el: HTMLElement): string {
	const transform = getComputedStyle(el).transform;
	return transform === 'none' ? '' : transform;
}

/** Whether the element uses a standalone `rotate`/`scale`/`translate` property. */
function hasIndividualTransforms(el: HTMLElement): boolean {
	const style = getComputedStyle(el);
	return style.rotate !== 'none' || style.scale !== 'none' || style.translate !== 'none';
}

/** Resolves one transform-origin axis (`left`/`center`/`50%`/`10px`...) to px. */
function originAxis(value: string, size: number): number {
	const axis = value.trim().toLowerCase();
	if (axis === 'left' || axis === 'top') return 0;
	if (axis === 'right' || axis === 'bottom') return size;
	if (axis === 'center') return size / 2;
	const parsed = parseFloat(axis);
	if (Number.isNaN(parsed)) return size / 2;
	return axis.endsWith('%') ? (parsed / 100) * size : parsed;
}

/** Resolves a transform-origin value to an offset from the element's top-left. */
function resolveOrigin(value: string, width: number, height: number): { x: number; y: number } {
	const [x, y = 'center'] = value.trim().split(/\s+/);
	return { x: originAxis(x, width), y: originAxis(y, height) };
}

/**
 * Wraps `base` (resolved by the browser around the element's natural
 * transform-origin) so it renders identically when the animation applies it
 * around a different pivot. Keeps the element's existing rotation/scale from
 * jumping when the step starts or ends.
 */
function aroundOrigin(
	base: string,
	natural: { x: number; y: number },
	forced: { x: number; y: number }
): string {
	if (!base) return '';
	const dx = natural.x - forced.x;
	const dy = natural.y - forced.y;
	if (dx === 0 && dy === 0) return base;
	return `translate(${dx}px, ${dy}px) ${base} translate(${-dx}px, ${-dy}px)`;
}

/** Appends the element's existing transform after a transition's transform. */
const withBase = (transform: string, base: string) => (base ? `${transform} ${base}` : transform);

/** The 2D affine part of a computed `transform` matrix. */
interface Matrix2D {
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
}

/** The transformable parts of a 2D matrix, used to tween transforms across a FLIP. */
interface TransformState {
	tx: number;
	ty: number;
	sx: number;
	sy: number;
	/** degrees; `0` when absent */
	rotate: number;
}

/**
 * Parses a computed `transform` into its 2D affine part. `none`/`''` resolve to
 * `null`; a 3D matrix falls back to its top-left 2x2 block and translation.
 */
function parseTransform(transform: string): Matrix2D | null {
	if (transform === '' || transform === 'none') return null;
	const matrix = transform.match(
		/^matrix\(([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+)\)$/
	);
	if (matrix) {
		return {
			a: Number(matrix[1]),
			b: Number(matrix[2]),
			c: Number(matrix[3]),
			d: Number(matrix[4]),
			e: Number(matrix[5]),
			f: Number(matrix[6])
		};
	}
	const matrix3d = transform.match(
		/^matrix3d\(([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+)\)$/
	);
	if (matrix3d) {
		return {
			a: Number(matrix3d[1]),
			b: Number(matrix3d[2]),
			c: Number(matrix3d[5]),
			d: Number(matrix3d[6]),
			e: Number(matrix3d[13]),
			f: Number(matrix3d[14])
		};
	}
	return null;
}

/**
 * Reconstructs the element's untransformed layout box from a measured (possibly
 * transformed) bounding rect: the box the element would occupy with
 * `transform: none`. `offsetWidth`/`offsetHeight` give the untransformed size;
 * the position is recovered by undoing the whole matrix (including its
 * translation) around the transform-origin.
 */
function layoutRectOf(
	el: HTMLElement,
	matrix: Matrix2D,
	rect: DOMRect,
	origin: { x: number; y: number }
): { left: number; top: number; width: number; height: number } {
	const width = el.offsetWidth || rect.width;
	const height = el.offsetHeight || rect.height;
	const centerX = rect.left + rect.width / 2;
	const centerY = rect.top + rect.height / 2;
	const dx = width / 2 - origin.x;
	const dy = height / 2 - origin.y;
	const mx = matrix.a * dx + matrix.c * dy;
	const my = matrix.b * dx + matrix.d * dy;
	return {
		left: centerX - origin.x - mx - matrix.e,
		top: centerY - origin.y - my - matrix.f,
		width,
		height
	};
}

/** Multiplies two 2D matrices (`a` applied after `b`). */
const mul = (a: Matrix2D, b: Matrix2D): Matrix2D => ({
	a: a.a * b.a + a.c * b.b,
	b: a.b * b.a + a.d * b.b,
	c: a.a * b.c + a.c * b.d,
	d: a.b * b.c + a.d * b.d,
	e: a.a * b.e + a.c * b.f + a.e,
	f: a.b * b.e + a.d * b.f + a.f
});

const matrixOfTranslate = (tx: number, ty: number): Matrix2D => ({
	a: 1,
	b: 0,
	c: 0,
	d: 1,
	e: tx,
	f: ty
});

const matrixOfRotate = (degrees: number): Matrix2D => {
	const rad = (degrees * Math.PI) / 180;
	return { a: Math.cos(rad), b: Math.sin(rad), c: -Math.sin(rad), d: Math.cos(rad), e: 0, f: 0 };
};

const matrixOfScale = (sx: number, sy: number): Matrix2D => ({
	a: sx,
	b: 0,
	c: 0,
	d: sy,
	e: 0,
	f: 0
});

const parseAngle = (value: string): number => parseFloat(value) || 0;

/** Resolves a `translate` axis value (`px`, `%`, or `0`) against the box size. */
function translateAxis(value: string, size: number): number {
	if (!value || value === '0') return 0;
	if (value.endsWith('%')) return (parseFloat(value) / 100) * size;
	return parseFloat(value) || 0;
}

/**
 * The element's effective transform matrix: the `transform` property combined
 * with the standalone `translate`/`rotate`/`scale` properties, which the CSS
 * spec applies before `transform` (points hit `scale`, then `rotate`, then
 * `translate`) and which do not show up in the computed `transform` value. The
 * FLIP tween animates this combined matrix so standalone transforms
 * rotate/scale across the flip like property transforms.
 */
function composeTransform(
	computed: CSSStyleDeclaration,
	individual: boolean,
	width: number,
	height: number
): Matrix2D | null {
	const matrix = parseTransform(computed.transform);
	if (!individual) return matrix;
	// `mul(a, b)` applies `a` after `b`, so folding in this order builds the
	// CSS `M = translate·rotate·scale·transform` product.
	let composed = matrix ?? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
	if (computed.scale !== 'none') {
		// `scale: 2` is a uniform scale, so a missing y axis defaults to x.
		const [sx = '1', sy] = computed.scale.split(/\s+/);
		composed = mul(matrixOfScale(parseFloat(sx) || 1, parseFloat(sy ?? sx) || 1), composed);
	}
	if (computed.rotate !== 'none') {
		composed = mul(matrixOfRotate(parseAngle(computed.rotate)), composed);
	}
	if (computed.translate !== 'none') {
		const [tx = '0', ty = '0'] = computed.translate.split(/\s+/);
		composed = mul(
			matrixOfTranslate(translateAxis(tx, width), translateAxis(ty, height)),
			composed
		);
	}
	return composed;
}

/**
 * Decomposes a matrix into its translate/scale/rotate parts (no skew). Exact
 * for `R(θ)·S`-form matrices (pure `rotate`/`scale`, and CSS lists like
 * `rotate(30deg) scale(2)`); `scale(2, 1) rotate(30deg)`-style lists and
 * arbitrary `matrix()` values decompose approximately. A reflection (det<0)
 * rides on the y scale so `rotate(180deg) scale(1, -1)` roundtrips a `scaleX(-1)`.
 */
function decomposeTransform(matrix: Matrix2D | null): TransformState {
	if (!matrix) return { tx: 0, ty: 0, sx: 1, sy: 1, rotate: 0 };
	const sx = Math.hypot(matrix.a, matrix.b);
	const sy = Math.hypot(matrix.c, matrix.d);
	const det = matrix.a * matrix.d - matrix.b * matrix.c;
	return {
		tx: matrix.e,
		ty: matrix.f,
		sx,
		sy: det < 0 ? -sy : sy,
		rotate: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI
	};
}

/** Rounds to 3 decimals, trimming float noise and trailing zeros. */
const fmt = (value: number) => String(Math.round(value * 1000) / 1000);

/** Serializes a transform state, omitting identity parts. */
function rebuildTransform(state: TransformState): string {
	// Round before the identity check: computed matrices round to 6 decimals,
	// so a pure rotation reads back as sx=0.99999968, which is exactly 1.
	const tx = Math.round(state.tx * 1000) / 1000;
	const ty = Math.round(state.ty * 1000) / 1000;
	const sx = Math.round(state.sx * 1000) / 1000;
	const sy = Math.round(state.sy * 1000) / 1000;
	const rotate = Math.round(state.rotate * 1000) / 1000;
	const parts: string[] = [];
	if (tx !== 0 || ty !== 0) parts.push(`translate(${fmt(tx)}px, ${fmt(ty)}px)`);
	if (rotate !== 0) parts.push(`rotate(${fmt(rotate)}deg)`);
	if (sx !== 1 || sy !== 1) parts.push(`scale(${fmt(sx)}, ${fmt(sy)})`);
	return parts.join(' ');
}

/** Lerps two transform states; rotation takes the shortest way around. */
function lerpTransformState(from: TransformState, to: TransformState, p: number): TransformState {
	const delta = ((to.rotate - from.rotate + 540) % 360) - 180;
	return {
		tx: lerp(from.tx, to.tx, p),
		ty: lerp(from.ty, to.ty, p),
		sx: lerp(from.sx, to.sx, p),
		sy: lerp(from.sy, to.sy, p),
		rotate: from.rotate + delta * p
	};
}

/** The containing block's border widths, which inset its padding-box edge. */
function paddingBoxOffset(el: Element): { left: number; top: number } {
	const style = getComputedStyle(el);
	return {
		left: parseFloat(style.borderLeftWidth) || 0,
		top: parseFloat(style.borderTopWidth) || 0
	};
}

/**
 * Whether `style` establishes a containing block for absolutely-positioned
 * descendants, per the CSS spec: positioned, transformed, filtered, or
 * contained. `container-type: inline-size` (Tailwind's `@container`) does NOT
 * create a containing block, so it is intentionally absent.
 */
function establishesContainingBlock(style: CSSStyleDeclaration): boolean {
	if (style.position !== 'static') return true;
	if (style.transform !== 'none') return true;
	if (style.perspective !== 'none') return true;
	if (style.filter !== 'none') return true;
	if (style.backdropFilter !== 'none') return true;
	if (/layout|paint|strict|content/.test(style.contain)) return true;
	return /transform|perspective|filter/.test(style.willChange);
}

/**
 * The nearest ancestor establishing the containing block for an
 * absolutely-positioned element. `offsetParent` misses SVG (it is `undefined`)
 * and any block formed by a transform, filter, or containment — so it must be
 * derived from computed styles instead.
 */
function absoluteContainingBlock(el: Element): Element | null {
	for (let node = el.parentElement; node; node = node.parentElement) {
		if (establishesContainingBlock(getComputedStyle(node))) return node;
	}
	return null;
}

/**
 * Animates a DOM change with a FLIP transition. On `start()` it snapshots the
 * bounds of every element tagged `data-layout`, runs `change()` (flushing
 * Svelte updates), then matches elements across the two states: retained
 * elements glide between bounds, newly added ones animate in with the `enter`
 * transition, and removed ones are cloned into fixed-position ghosts appended
 * to `document.body` that animate out with the `exit` transition (skipped when
 * `exit` is `'none'`). Ghosts are removed on `end()`/`revert()`.
 */
export class LayoutStep implements Step {
	#state: Record<string, unknown>;
	#change: () => void;
	#duration: number;
	#ease: Easing;
	#enter: LayoutTransition;
	#exit: LayoutTransition;
	#scale: boolean;
	#enterEnd: number;
	#exitEnd: number;
	#stagger: number;
	#snapshot: Record<string, unknown> = {};
	#tweens: LayoutTween[] = [];

	constructor(
		state: Record<string, unknown>,
		change: () => void,
		duration: number,
		options: LayoutOptions = {}
	) {
		this.#state = state;
		this.#change = change;
		this.#duration = duration;
		this.#ease = options.ease ?? easeInOut;
		this.#enter = options.enter ?? DEFAULT_ENTER;
		this.#exit = options.exit ?? DEFAULT_EXIT;
		this.#scale = options.scale ?? true;
		this.#enterEnd = clamp(options.enterEnd ?? 1, 0, 1);
		this.#exitEnd = clamp(options.exitEnd ?? 1, 0, 1);
		this.#stagger = clamp(options.stagger ?? 0, 0, 1);
	}

	get duration(): number {
		return this.#duration;
	}

	setProgress(p: number) {
		const progress = clamp(p, 0, 1);
		const eased = this.#ease(progress);
		for (const tween of this.#tweens) {
			if (tween.mode === 'flip') {
				const scaleX = tween.scale ? lerp(tween.scale.x0, 1, eased) : 1;
				const scaleY = tween.scale ? lerp(tween.scale.y0, 1, eased) : 1;
				if (tween.scale) {
					tween.scale.x = scaleX;
					tween.scale.y = scaleY;
				}
				const dx = tween.offset ? lerp(tween.offset.x, 0, eased) : 0;
				const dy = tween.offset ? lerp(tween.offset.y, 0, eased) : 0;
				for (const prop of tween.props) {
					const values = prop.from.map((from, i) => from + (prop.to[i] - from) * eased);
					tween.el.style.setProperty(prop.prop, prop.format(values));
				}
				if (tween.size) {
					tween.el.style.width = `${lerp(tween.size.fromW, tween.size.toW, eased)}px`;
					tween.el.style.height = `${lerp(tween.size.fromH, tween.size.toH, eased)}px`;
				}
				let flip = '';
				if (tween.parentScale) {
					// The element is pinned at its final local spot; cancel the
					// ancestor's scale (net scale 1) while the position glides
					// inside the ancestor's scaled space.
					const sPx = lerp(tween.parentScale.x0, 1, eased);
					const sPy = lerp(tween.parentScale.y0, 1, eased);
					const fx = tween.localFinal.x;
					const fy = tween.localFinal.y;
					const pxOffset = (fx + dx) / sPx - fx;
					const pyOffset = (fy + dy) / sPy - fy;
					flip = `translate(${pxOffset}px, ${pyOffset}px) scale(${scaleX / sPx}, ${scaleY / sPy})`;
				} else if (tween.scale) {
					flip = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
				} else if (tween.offset && (tween.offset.x !== 0 || tween.offset.y !== 0)) {
					flip = `translate(${dx}px, ${dy}px)`;
				}
				// The element's own transform glides from its previous matrix to
				// its final one, outermost so it rotates on top of the flip.
				const tweened = tween.transform
					? rebuildTransform(lerpTransformState(tween.transform.from, tween.transform.to, eased))
					: '';
				// A transform tween writes every frame (an identity frame clears
				// the property); a flip-only tween writes only while active so a
				// stationary element is never touched.
				if (tween.transform || flip) {
					tween.el.style.transform = flip ? (tweened ? `${flip} ${tweened}` : flip) : tweened;
				}
			} else {
				const direction = tween.mode === 'enter' ? 'enter' : 'exit';
				// Exit transitions finish by `exitEnd` so removed elements are
				// gone before the layout settles; the enter runs for the whole
				// step (`enterEnd` defaults to 1).
				const end = direction === 'enter' ? this.#enterEnd : this.#exitEnd;
				// `stagger` offsets each element's transition start so a batch
				// added/removed together animates one after another.
				const start = this.#stagger * tween.staggerIndex;
				// A zero-length mapping domain (`enterEnd`/`exitEnd: 0`, or a
				// stagger offset that reaches the transition's end) would divide
				// by zero into NaN on the first frame; the transition is already
				// complete for that element.
				const p = end === 0 || end <= start ? 1 : clampRemap(eased, start, end, 0, 1);
				const value = transitionValue(tween.transition, p, direction, tween.el);
				if (value.opacity !== undefined)
					// Compose with the element's own opacity so a class-based
					// value (e.g. Tailwind's `opacity-60`) is the ceiling: the
					// transition fades 0 → baseOpacity and clearing the inline
					// style at the end lands on the same class value instead of
					// popping to it.
					tween.el.style.opacity = String(tween.baseOpacity * value.opacity);
				if (tween.mode === 'exit' && tween.ancestor) {
					// Ride the retained ancestor's FLIP motion (interpolated on
					// the full step, while the fade runs on the transition's own
					// timeline): scale the ghost's offset by the ancestor's
					// current scale and add its current translation, so the
					// ghost stays glued to the shrinking card it used to live
					// in instead of freezing at its old viewport spot. The
					// scale is normalized by the ancestor's initial scale so
					// the ghost starts at its native size (what was on screen
					// before the change) and only shrinks with the card.
					const a = tween.ancestor;
					const sx = lerp(a.x0, 1, eased) / a.x0;
					const sy = lerp(a.y0, 1, eased) / a.y0;
					const dx = lerp(a.dx0, 0, eased);
					const dy = lerp(a.dy0, 0, eased);
					// The ancestor's animated layout origin, relative to the
					// ghost's pinned spot. `a.local` offsets the ghost from the
					// ancestor's previous origin, so at progress 0 the ride is
					// exactly the ghost's pre-change position.
					const ox = a.left + dx - tween.fixed.left;
					const oy = a.top + dy - tween.fixed.top;
					let ride: string;
					if (a.transform) {
						// The ancestor's own transform rides too, tweened across
						// the step like its flip: its rotation and scale deform
						// the ghost around the ancestor's transform-origin (a
						// rotated card spins its exiting content with it) and
						// its translation shifts the whole ghost. The pivot is
						// the ancestor's transform-origin, so decomposition —
						// exact for translate and pure rotate/scale — only
						// drifts when an ancestor both scales and rotates
						// around an off-corner origin.
						const own = lerpTransformState(a.transform.from, a.transform.to, eased);
						ride =
							`translate(${fmt(ox)}px, ${fmt(oy)}px) ` +
							`translate(${fmt(a.origin.x + own.tx)}px, ${fmt(a.origin.y + own.ty)}px) ` +
							`rotate(${fmt(own.rotate)}deg) scale(${fmt(own.sx)}, ${fmt(own.sy)}) ` +
							`translate(${fmt(-a.origin.x)}px, ${fmt(-a.origin.y)}px) ` +
							`scale(${fmt(sx)}, ${fmt(sy)}) translate(${fmt(a.local.x)}px, ${fmt(a.local.y)}px)`;
					} else {
						ride = `translate(${fmt(ox + a.local.x * sx)}px, ${
							fmt(oy + a.local.y * sy)
						}px) scale(${fmt(sx)}, ${fmt(sy)})`;
					}
					tween.el.style.transform =
						value.transform !== undefined
							? `${ride} ${withBase(value.transform, tween.base)}`
							: ride;
				} else if (value.transform !== undefined) {
					tween.el.style.transform = withBase(value.transform, tween.base);
				}
				if (value.clipPath !== undefined) tween.el.style.clipPath = value.clipPath;
				if (value.transformOrigin !== undefined)
					tween.el.style.transformOrigin = value.transformOrigin;
				if (value.rotate !== undefined) tween.el.style.rotate = value.rotate;
				if (value.scale !== undefined) tween.el.style.scale = value.scale;
				if (value.translate !== undefined) tween.el.style.translate = value.translate;
				// Exit ghosts leave the layout tree, so only entered elements
				// can sit under a scaling ancestor that needs counter-scaling.
				if (tween.mode === 'enter' && tween.parentScale) {
					// Counter-scale over the transition transform (applied last,
					// in the unscaled space) so the element stays crisp. The
					// ancestor's own FLIP offset is cancelled too, so new
					// content sits at its destination instead of riding the
					// ancestor's motion to a projected spot (a reused container
					// like a hero card never actually moves, so riding would
					// fling entering children to an arbitrary position).
					const sPx = lerp(tween.parentScale.x0, 1, eased);
					const sPy = lerp(tween.parentScale.y0, 1, eased);
					const parentDx = lerp(tween.parentScale.dx0, 0, eased);
					const parentDy = lerp(tween.parentScale.dy0, 0, eased);
					const lx = tween.localFinal.x;
					const ly = tween.localFinal.y;
					const counter = `translate(${lx * (1 / sPx - 1) - parentDx / sPx}px, ${
						ly * (1 / sPy - 1) - parentDy / sPy
					}px) scale(${1 / sPx}, ${1 / sPy})`;
					tween.el.style.transform = withBase(
						value.transform ? `${value.transform} ${counter}` : counter,
						tween.base
					);
				}
			}
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

		// `data-layout` is an HTML-first contract; the cast keeps the types
		// simple while SVG roots (e.g. `<svg data-layout>` scenes) ride along
		// as best-effort because CSS positioning applies to them too.
		const elements = [...document.querySelectorAll('[data-layout]')] as HTMLElement[];
		const firstBounds = new Map<string, LayoutBounds>();
		for (const el of elements) {
			const rect = el.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				const bounds = captureBounds(el, rect);
				// The change may reuse the node (rewriting its `data-layout`
				// and content); the exit ghost must render the state being
				// left, so clone before `change()` runs.
				bounds.clone = el.cloneNode(true) as HTMLElement;
				firstBounds.set(el.dataset.layout!, bounds);
			}
		}

		this.#change();
		flushSync();

		const lastElements = [...document.querySelectorAll('[data-layout]')] as HTMLElement[];
		const lastBounds = new Map<string, LayoutBounds>();
		for (const el of lastElements) {
			const rect = el.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				lastBounds.set(el.dataset.layout!, captureBounds(el, rect));
			}
		}

		this.#tweens = [];

		// Positions within the entering/exiting sets, used to stagger each
		// element's transition start in DOM order.
		let enterCount = 0;
		let exitCount = 0;

		// The containing block for an absolutely-positioned element: the
		// nearest `data-layout` ancestor (so nested elements follow their
		// animated parent), else the ancestor establishing a CSS containing
		// block (positioned, transformed, filtered, or a container — anything
		// `offsetParent` would miss, such as SVG or the scene's transition
		// transform), else the viewport. Both states are returned because the
		// ancestor itself glides from its old bounds to its final ones, and the
		// child's local coordinates must be measured against each.
		const originOf = (
			el: HTMLElement
		): { prev: { left: number; top: number }; final: { left: number; top: number } } => {
			// Skip the element itself: `closest` includes self, and the
			// coordinate space of an element is its ancestor's.
			const ancestor = el.parentElement?.closest('[data-layout]');
			if (ancestor) {
				// `left`/`top` on the pinned element resolve against the
				// containing block's padding-box edge, so the border-box origin
				// is shifted out by the ancestor's border widths.
				const border = paddingBoxOffset(ancestor as HTMLElement);
				const prev = firstBounds.get((ancestor as HTMLElement).dataset.layout!);
				const final = lastBounds.get((ancestor as HTMLElement).dataset.layout!);
				return {
					// The ancestor's untransformed layout box: a transformed
					// ancestor anchors its children around its own (rotated)
					// measured bounds, which would misplace pinned children.
					prev: prev
						? { left: prev.layout.left + border.left, top: prev.layout.top + border.top }
						: { left: 0, top: 0 },
					final: final
						? { left: final.layout.left + border.left, top: final.layout.top + border.top }
						: { left: 0, top: 0 }
				};
			}
			const block = absoluteContainingBlock(el);
			if (block) {
				const border = paddingBoxOffset(block);
				const rect = block.getBoundingClientRect();
				return {
					prev: { left: rect.left + border.left, top: rect.top + border.top },
					final: { left: rect.left + border.left, top: rect.top + border.top }
				};
			}
			return { prev: { left: 0, top: 0 }, final: { left: 0, top: 0 } };
		};

		// Retained elements that morph between sizes scale via a transform (see
		// below); children look this map up to cancel the ancestor's scale so
		// their content stays crisp while the ancestor morphs. Font-changed text
		// scales uniformly by its font ratio — a uniform scale is what reads as
		// the text genuinely growing — while boxes scale by their bounds.
		const scaling = new Map<
			string,
			{ x0: number; y0: number; x: number; y: number; dx0: number; dy0: number }
		>();
		for (const [key, { el, layout, text }] of lastBounds) {
			const prev = firstBounds.get(key);
			if (!prev) continue;
			const fontChanged = prev.text.fontSize !== text.fontSize;
			const sizeChanged = morphsSize(prev, { el, layout, text });
			if (!((this.#scale || (hasDirectText(el) && fontChanged)) && sizeChanged)) continue;
			const finalFont = parseFloat(text.fontSize);
			const uniform =
				hasDirectText(el) && fontChanged && finalFont > 0
					? parseFloat(prev.text.fontSize) / finalFont
					: undefined;
			// The ancestor's own FLIP offset (previous minus final local spot),
			// measured like the retained tween's `offset` below. Entering
			// children cancel it so new content stays at its destination
			// instead of riding the ancestor's motion.
			const originAt = originOf(el);
			const finalLeft = layout.left - originAt.final.left;
			const finalTop = layout.top - originAt.final.top;
			scaling.set(key, {
				x0: uniform ?? prev.layout.width / layout.width,
				y0: uniform ?? prev.layout.height / layout.height,
				x: 1,
				y: 1,
				dx0: prev.layout.left - originAt.prev.left - finalLeft,
				dy0: prev.layout.top - originAt.prev.top - finalTop
			});
		}

		const parentScaleOf = (el: HTMLElement) => {
			// Skip the element itself, mirroring `originOf`.
			const ancestor = el.parentElement?.closest('[data-layout]') as HTMLElement | null;
			return ancestor ? scaling.get(ancestor.dataset.layout!) : undefined;
		};

		for (const [
			key,
			{ el, styles, text, ink, matrix, origin, layout, individual, borderWidth, opacity }
		] of lastBounds) {
			const prev = firstBounds.get(key);
			if (prev) {
				// Take the element out of flow so the container's size tween
				// can't re-lay-out it mid-animation (e.g. a flex row
				// re-distributing). It is pinned at its final bounds and moved
				// via a transform so position and size glide at float precision
				// instead of re-laying-out fractional geometry each frame.
				const originAt = originOf(el);
				el.style.position = 'absolute';
				// `top`/`left` position the margin box, so margins would shift
				// the border box; drop them and place the border box directly.
				el.style.margin = '0';
				// Override min/max so they can't clamp the animated width/height.
				el.style.minWidth = 'auto';
				el.style.minHeight = 'auto';
				el.style.maxWidth = 'none';
				el.style.maxHeight = 'none';
				const finalLeft = layout.left - originAt.final.left;
				const finalTop = layout.top - originAt.final.top;
				// Pin at the final bounds so a shrink-wrapped box (e.g. an
				// absolutely-positioned text run that becomes a full-width block)
				// doesn't snap to its final size when the step ends. A
				// transformed element pins its untransformed layout box: the
				// rotation tween renders the measured transform on top.
				el.style.left = px(finalLeft);
				el.style.top = px(finalTop);
				el.style.width = px(layout.width);
				el.style.height = px(layout.height);
				const fontChanged = prev.text.fontSize !== text.fontSize;
				const sizeChanged = morphsSize(prev, { el, layout, text });
				const scale = scaling.get(key);
				const parentScale = parentScaleOf(el);
				const props: LayoutPropTween[] = [];
				// Measured as a local delta, not absolute: an ancestor that moves
				// exactly as much as the element's own reflow (leaving its
				// absolute spot unchanged) still needs the parent-scale
				// compensation computed from the local shift, or the child
				// glides under the counter-scale.
				const offset = {
					x: prev.layout.left - originAt.prev.left - finalLeft,
					y: prev.layout.top - originAt.prev.top - finalTop
				};
				if (scale && fontChanged && prev.ink && ink) {
					// The glyph ink sits at a different offset within the box at
					// each font size, so aligning the boxes leaves the text a few
					// pixels off on the first frame. Shift the offset so the
					// uniformly-scaled text lands on the previous ink instead.
					const finalFont = parseFloat(text.fontSize);
					if (finalFont > 0) {
						const r = parseFloat(prev.text.fontSize) / finalFont;
						offset.x += prev.ink.left - prev.layout.left - (ink.left - layout.left) * r;
						offset.y += prev.ink.top - prev.layout.top - (ink.top - layout.top) * r;
					}
				}
				// `scale: false` opts into morphing width/height so nested text
				// and images rasterize at native size at the cost of per-frame
				// re-layout; the default pins the final size and scales the box
				// back, keeping the motion on the compositor.
				const size =
					!scale && sizeChanged
						? {
								fromW: prev.layout.width,
								fromH: prev.layout.height,
								toW: layout.width,
								toH: layout.height
							}
						: undefined;
				// The element's own transform is tweened across the flip — from
				// the previous state's matrix to the final one's — and applies
				// around the element's natural transform-origin (an un-anchored
				// pivot, so the position offset compensates for it when the box
				// scales). Standalone `rotate`/`scale`/`translate` are folded
				// into that tween and suppressed while the step runs.
				const transformed = Boolean(prev.matrix || matrix);
				// The current element's standalone props are folded into the
				// tweened matrix, so override them to identity while the step
				// runs (an inline `''` wouldn't beat a stylesheet rule like
				// Tailwind's `rotate-45`); the snapshot restores them on clear.
				const suppressIndividual = individual;
				// Snapshot before suppressing so the author's standalone props
				// survive to be restored on clear.
				const inline = snapshotInline(el);
				const forceTopLeft = (scale || parentScale) && !transformed;
				if (forceTopLeft) el.style.transformOrigin = 'top left';
				else if (scale || parentScale) {
					offset.x += origin.x * (scale ? scale.x0 - 1 : 0);
					offset.y += origin.y * (scale ? scale.y0 - 1 : 0);
				}
				if (suppressIndividual) {
					el.style.rotate = '0deg';
					el.style.scale = '1';
					el.style.translate = '0px';
				}
				const transform = transformed
					? { from: decomposeTransform(prev.matrix), to: decomposeTransform(matrix) }
					: undefined;
				for (const prop of Object.keys(LAYOUT_PROPS)) {
					// A borderless box computes `border-color` as currentColor
					// even though nothing renders, so a key that moves between
					// a bordered and a borderless node would tween the color
					// onto the element's own border width and paint a visible
					// (here white) frame around the morph.
					if (prop === 'border-color' && (prev.borderWidth === '0px' || borderWidth === '0px'))
						continue;
					let tween = createLayoutPropTween(
						prop,
						prev.styles[prop],
						styles[prop],
						prop === 'border-radius' ? Math.min(layout.width, layout.height) / 2 : undefined
					);
					if (prop === 'border-radius' && scale) {
						const radius = parseRadius(styles[prop]);
						if (radius && radius.unit === 'px') {
							// A scaling box stretches its border-radius with it,
							// so emit an elliptical radius divided by the current
							// scale to keep the corners at the tweened value.
							const format = (values: number[]) => {
								const horizontal = values.map((v) => `${v / scale!.x}px`);
								const vertical = values.map((v) => `${v / scale!.y}px`);
								return `${horizontal.join(' ')} / ${vertical.join(' ')}`;
							};
							tween = tween
								? { ...tween, format }
								: { prop, from: radius.values, to: radius.values, format };
						}
					}
					if (tween) props.push(tween);
				}
				this.#tweens.push({
					el,
					mode: 'flip',
					transition: 'none',
					props,
					offset,
					size,
					scale,
					parentScale,
					localFinal: { x: finalLeft, y: finalTop },
					transform,
					inline
				});
			} else {
				// A nested element entering inside an entering data-layout
				// ancestor rides its animation (transform/opacity propagate down
				// the subtree) and must not consume a stagger slot, or cards
				// under a larger batch index past the enter window and appear
				// instantly.
				const ancestor = el.parentElement?.closest('[data-layout]');
				const ancestorKey = ancestor?.getAttribute('data-layout') ?? '';
				if (ancestor && lastBounds.has(ancestorKey) && !firstBounds.has(ancestorKey)) continue;
				// Pin newly added elements at their final spot, out of flow, so
				// siblings re-flowing during the step can't shift them; animate
				// in with the enter transition on top of that.
				const originAt = originOf(el);
				const left = layout.left - originAt.final.left;
				const top = layout.top - originAt.final.top;
				el.style.position = 'absolute';
				el.style.margin = '0';
				el.style.left = px(left);
				el.style.top = px(top);
				el.style.width = px(layout.width);
				el.style.height = px(layout.height);
				const inline = snapshotInline(el);
				const rawBase = computedTransformOf(el);
				const parentScale = parentScaleOf(el);
				// The counter-scale below assumes a top-left pivot, so an
				// element under a scaling ancestor always pivots there, even if
				// the enter transition wants its own origin.
				const base = this.#applyStart(
					el,
					this.#enter,
					'enter',
					rawBase,
					layout.width,
					layout.height,
					Boolean(parentScale)
				);
				this.#tweens.push({
					el,
					mode: 'enter',
					transition: this.#enter,
					props: [],
					parentScale,
					localFinal: { x: left, y: top },
					staggerIndex: enterCount++,
					base,
					baseOpacity: opacity,
					inline
				});
			}
		}

		for (const [key, { el, clone, text, display, layout, opacity }] of firstBounds) {
			if (lastBounds.has(key)) continue;
			if (this.#exit === 'none') continue;
			// An exiting element already lives inside its data-layout
			// ancestor's ghost clone, so a second ghost would render the
			// content twice (e.g. a nested text span duplicated on exit).
			// The ancestor is matched by node identity against the snapshot: a
			// reused node may have had its `data-layout` rewritten in place
			// (e.g. a hero card becoming the next hero's card), so its current
			// attribute no longer names the entity the child belonged to.
			const parentEl = el.parentElement?.closest('[data-layout]') as HTMLElement | null;
			let ancestorKey: string | undefined;
			if (parentEl) {
				for (const [oldKey, bounds] of firstBounds) {
					if (bounds.el === parentEl) {
						ancestorKey = oldKey;
						break;
					}
				}
			}
			if (ancestorKey === undefined) ancestorKey = parentEl?.getAttribute('data-layout') ?? '';
			if (parentEl && firstBounds.has(ancestorKey) && !lastBounds.has(ancestorKey)) continue;
			// Pin at the untransformed layout box, not the measured rect: the
			// composed base re-applies the transform, so pinning the rotated
			// rect too would render the ghost inflated.
			const ghost = this.#createGhost(clone ?? el, layout, text, display);
			const ghostInline = snapshotInline(ghost);
			// The ghost keeps the source's standalone props (they are not in the
			// composed base), so it exits while staying tilted.
			const base = this.#applyStart(
				ghost,
				this.#exit,
				'exit',
				computedTransformOf(ghost),
				layout.width,
				layout.height
			);
			// A removed element whose `data-layout` ancestor survives the
			// change rides the ancestor's FLIP motion: the ghost is pinned to
			// the viewport, so without compensation it would freeze at its
			// pre-change spot while the card glides and shrinks away from it.
			let ancestorMotion: ExitAncestor | undefined;
			if (parentEl && lastBounds.has(ancestorKey)) {
				const prev = firstBounds.get(ancestorKey)!;
				const last = lastBounds.get(ancestorKey)!;
				// The `scaling` map is populated only for ancestors that morph
				// via transform scale (`scale: false` re-lays-out instead), so
				// its presence decides whether the ghost's ride must scale.
				const morphs = scaling.get(ancestorKey);
				// The ancestor's own transform, decomposed exactly like its flip
				// tween's, so the ghost rotates/scales with it across the step.
				// Read from the keyed snapshots so a node replaced by the change
				// (a Svelte re-key) still contributes its transform.
				const transformed = Boolean(prev.matrix || last.matrix);
				ancestorMotion = {
					dx0: prev.layout.left - last.layout.left,
					dy0: prev.layout.top - last.layout.top,
					x0: morphs ? prev.layout.width / last.layout.width : 1,
					y0: morphs ? prev.layout.height / last.layout.height : 1,
					left: last.layout.left,
					top: last.layout.top,
					local: { x: layout.left - prev.layout.left, y: layout.top - prev.layout.top },
					transform: transformed
						? {
								from: decomposeTransform(prev.matrix),
								to: decomposeTransform(last.matrix)
							}
						: undefined,
					origin: last.origin
				};
				// The ride transform scales the ghost from its own corner so
				// it replicates the ancestor's motion around its own spot.
				ghost.style.transformOrigin = 'top left';
			}
			this.#tweens.push({
				el: ghost,
				mode: 'exit',
				transition: this.#exit,
				props: [],
				staggerIndex: exitCount++,
				base,
				baseOpacity: opacity,
				inline: ghostInline,
				fixed: { left: layout.left, top: layout.top },
				ancestor: ancestorMotion
			});
		}

		// Snap every tween to its start state so the first painted frame shows
		// the previous bounds (the transform pinning is only applied here).
		this.setProgress(0);
	}

	/**
	 * Snaps an element to its transition's start state and returns the
	 * transition-composed version of its existing transform (the tween reuses
	 * it every frame). `forceTopLeft` makes the counter-scale under a scaling
	 * ancestor win over the transition's own pivot.
	 */
	#applyStart(
		el: HTMLElement,
		transition: LayoutTransition,
		direction: 'enter' | 'exit',
		base: string,
		width: number,
		height: number,
		forceTopLeft = false
	): string {
		const value = transitionValue(transition, 0, direction, el);
		const natural = resolveOrigin(getComputedStyle(el).transformOrigin, width, height);
		let forced = natural;
		let originStyle: string | null = null;
		if (forceTopLeft) {
			forced = { x: 0, y: 0 };
			originStyle = 'top left';
		} else if (transition === 'scale') {
			forced = { x: width / 2, y: height / 2 };
			originStyle = 'center';
		} else if (value.transformOrigin !== undefined) {
			forced = resolveOrigin(value.transformOrigin, width, height);
			originStyle = value.transformOrigin;
		}
		if (originStyle !== null) el.style.transformOrigin = originStyle;
		const composed = aroundOrigin(base, natural, forced);
		if (value.opacity !== undefined) el.style.opacity = String(value.opacity);
		if (value.transform !== undefined) el.style.transform = withBase(value.transform, composed);
		if (value.clipPath !== undefined) el.style.clipPath = value.clipPath;
		if (value.rotate !== undefined) el.style.rotate = value.rotate;
		if (value.scale !== undefined) el.style.scale = value.scale;
		if (value.translate !== undefined) el.style.translate = value.translate;
		return composed;
	}

	#createGhost(
		el: HTMLElement,
		box: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
		text: LayoutTextMetrics,
		display: string
	): HTMLElement {
		const ghost = el.cloneNode(true) as HTMLElement;
		// The ghost leaves the element's flow context (it is appended to
		// <body>), so class-relative text sizing — em/rem against a scaled
		// ancestor, container-query fonts — would resolve differently and the
		// exiting text would jump size. Pin the source's resolved text metrics.
		ghost.style.fontFamily = text.fontFamily;
		ghost.style.fontSize = text.fontSize;
		ghost.style.fontWeight = text.fontWeight;
		ghost.style.fontStyle = text.fontStyle;
		ghost.style.fontVariant = text.fontVariant;
		ghost.style.lineHeight = text.lineHeight;
		ghost.style.letterSpacing = text.letterSpacing;
		ghost.style.wordSpacing = text.wordSpacing;
		ghost.style.color = text.color;
		ghost.style.position = 'fixed';
		ghost.style.left = `${box.left}px`;
		ghost.style.top = `${box.top}px`;
		ghost.style.width = `${box.width}px`;
		ghost.style.height = `${box.height}px`;
		ghost.style.margin = '0';
		// Preserve the source's display so grid/flex centering of nested
		// content survives the clone (the source is always captured visible,
		// so `display` is never `none`).
		ghost.style.display = display;
		ghost.style.pointerEvents = 'none';
		document.body.appendChild(ghost);
		return ghost;
	}

	#clearStyles(tween: LayoutTween) {
		if (tween.mode === 'exit') {
			tween.el.remove();
		} else {
			// Restore the author's inline styles instead of wiping them: a
			// layout step overrides these during the animation and must leave
			// the element exactly as it found it.
			const { inline } = tween;
			tween.el.style.transform = inline.transform;
			tween.el.style.clipPath = inline.clipPath;
			tween.el.style.transformOrigin = inline.transformOrigin;
			tween.el.style.rotate = inline.rotate;
			tween.el.style.scale = inline.scale;
			tween.el.style.translate = inline.translate;
			tween.el.style.position = '';
			tween.el.style.margin = '';
			tween.el.style.left = '';
			tween.el.style.top = '';
			tween.el.style.width = '';
			tween.el.style.height = '';
			tween.el.style.minWidth = '';
			tween.el.style.minHeight = '';
			tween.el.style.maxWidth = '';
			tween.el.style.maxHeight = '';
			// Auto-tweened props are only ever temporary overrides. A retained
			// element ends back on its own inline value (restored to `''` for
			// class-driven props so the class stays authoritative), while an
			// untouched prop — e.g. a constant `style:background-color`
			// directive — must survive the step. Entering elements keep the
			// old wipe: their only animated visual prop is the
			// transition-managed opacity.
			const tweened = new Set(tween.props.map((p) => p.prop));
			for (const prop of Object.keys(LAYOUT_PROPS)) {
				if (tween.mode === 'flip') {
					if (tweened.has(prop)) tween.el.style.setProperty(prop, inline.layoutProps[prop]);
				} else {
					tween.el.style.setProperty(prop, '');
				}
			}
		}
	}

	end() {
		for (const tween of this.#tweens) this.#clearStyles(tween);
		this.#tweens = [];
	}

	revert() {
		for (const key of Object.keys(this.#snapshot)) {
			this.#state[key] = this.#snapshot[key];
		}
		for (const tween of this.#tweens) this.#clearStyles(tween);
		this.#tweens = [];
		this.#snapshot = {};
	}
}

/**
 * Runs several steps concurrently as one step. Duration is the longest
 * sub-step; each sub-step's progress is scaled by its own duration relative to
 * the longest, and a sub-step's `end()` fires exactly once when it completes.
 */
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
			const step = this.#steps[i];
			const stepProgress =
				step.duration > 0 ? clamp(progress * (this.duration / step.duration), 0, 1) : progress;
			step.setProgress(stepProgress);
			if (stepProgress >= 1) {
				this.#done[i] = true;
				step.end();
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

/**
 * Morphs a {@link CodeState} between two source versions. `start()` runs
 * `build()` and diffs the versions into morph tokens; when the language
 * changes, all existing tokens are deleted and the target is re-highlighted as
 * all-new creates. If the highlighter is not ready when the step starts (or an
 * extra language is still loading), the diff is deferred and recomputed on the
 * next highlighter readiness or language-load notification, so a step that
 * begins before Shiki loads never commits empty tokens. `setProgress` feeds
 * the raw progress through the easing into `morphProgress` (remapped within
 * the 0.2..0.8 window), and the resulting morph is committed on `end()`.
 * `revert()` restores the full pre-step snapshot.
 */
export class CodeStep implements Step {
	#codeState: CodeState;
	#build: () => { from: string; to: string; resolved: string };
	#duration: number;
	#ease: Easing;
	#language: string | null = null;
	#snapshot: {
		resolved: string;
		settled: PositionedToken[];
		tokens: MorphToken[] | null;
		rawProgress: number;
		progress: number;
		morphProgress: number;
		language: string;
	} | null = null;
	#pendingResolved = '';
	#pendingSettled: PositionedToken[] = [];
	#from = '';
	#to = '';
	#langChanged = false;
	#active = false;
	#refreshArmed = false;

	constructor(
		codeState: CodeState,
		build: () => { from: string; to: string; resolved: string },
		duration: number,
		ease: Easing = easeInOut,
		language?: string
	) {
		this.#codeState = codeState;
		this.#build = build;
		this.#duration = duration;
		this.#ease = ease;
		this.#language = language ?? null;
	}

	get duration(): number {
		return this.#duration;
	}

	start() {
		this.#langChanged = this.#language !== null && this.#language !== this.#codeState.language;
		this.#snapshot = {
			resolved: this.#codeState.resolved,
			settled: this.#codeState.settled,
			tokens: this.#codeState.tokens,
			rawProgress: this.#codeState.rawProgress,
			progress: this.#codeState.progress,
			morphProgress: this.#codeState.morphProgress,
			language: this.#codeState.language
		};
		this.#pendingResolved = this.#codeState.resolved;
		this.#pendingSettled = this.#codeState.settled;
		if (this.#langChanged) this.#codeState.language = this.#language!;
		const { from, to, resolved } = this.#build();
		this.#from = from;
		this.#to = to;
		this.#active = true;
		this.#applyDiff();
		this.#codeState.rawProgress = 0;
		this.#codeState.progress = 0;
		this.#codeState.morphProgress = 0;
		this.#pendingResolved = resolved;
	}

	#applyDiff() {
		if (this.#langChanged) {
			const deletes: MorphToken[] = this.#codeState.settled.map((t) => ({
				code: t.code,
				color: t.color,
				morph: 'delete',
				from: [t.col, t.line],
				to: null
			}));
			const creates: MorphToken[] = highlight(this.#to, this.#codeState.language).map((t) => ({
				code: t.code,
				color: t.color,
				morph: 'create',
				from: null,
				to: [t.col, t.line]
			}));
			this.#codeState.tokens = [...deletes, ...creates];
			this.#pendingSettled = highlight(this.#to, this.#codeState.language);
		} else {
			this.#codeState.tokens = diffStrings(this.#from, this.#to, this.#codeState.language);
			this.#pendingSettled = highlight(this.#to, this.#codeState.language);
		}
		const stillEmpty = this.#codeState.tokens.length === 0 && this.#pendingSettled.length === 0;
		if (stillEmpty) {
			this.#armRefresh();
		} else {
			this.#refreshArmed = false;
		}
	}

	#armRefresh() {
		if (this.#refreshArmed) return;
		this.#refreshArmed = true;
		if (!isHighlighterReady()) {
			onHighlighterReady(() => {
				if (this.#active) this.#applyDiff();
			});
		} else {
			// Highlighter is up but an extra language may still be loading;
			// recompute on the next language-load notification.
			onHighlighterRefresh(() => {
				if (this.#active) this.#applyDiff();
			});
		}
	}

	setProgress(p: number) {
		const raw = clamp(p, 0, 1);
		const eased = this.#ease(raw);
		this.#codeState.rawProgress = raw;
		this.#codeState.progress = eased;
		this.#codeState.morphProgress = clampRemap(eased, this.#ease(0.2), this.#ease(0.8), 0, 1);
	}

	end() {
		this.#active = false;
		this.#refreshArmed = false;
		this.#codeState.resolved = this.#pendingResolved;
		this.#codeState.settled = this.#pendingSettled;
		this.#codeState.tokens = null;
		this.#codeState.rawProgress = 1;
		this.#codeState.progress = 1;
		this.#codeState.morphProgress = 1;
	}

	revert() {
		this.#active = false;
		this.#refreshArmed = false;
		if (!this.#snapshot) return;
		this.#codeState.resolved = this.#snapshot.resolved;
		this.#codeState.settled = this.#snapshot.settled;
		this.#codeState.tokens = this.#snapshot.tokens;
		this.#codeState.rawProgress = this.#snapshot.rawProgress;
		this.#codeState.progress = this.#snapshot.progress;
		this.#codeState.morphProgress = this.#snapshot.morphProgress;
		this.#codeState.language = this.#snapshot.language;
		this.#snapshot = null;
	}
}

/**
 * Animates the selection highlight moving to `range`. `start()` swaps the
 * code state's selection and records the previous one so the opacity lerps
 * between them; `revert()` restores the original selection.
 */
export class SelectionStep implements Step {
	#codeState: CodeState;
	#range: CodeRange | CodeRange[] | RangeResolver | string | typeof DEFAULT;
	#duration: number;
	#snapshot: { selection: CodeRange[]; selectionProgress: number | null } | null = null;

	constructor(
		codeState: CodeState,
		range: CodeRange | CodeRange[] | RangeResolver | string | typeof DEFAULT,
		duration: number
	) {
		this.#codeState = codeState;
		this.#range = range;
		this.#duration = duration;
	}

	get duration(): number {
		return this.#duration;
	}

	start() {
		this.#snapshot = {
			selection: this.#codeState.selection,
			selectionProgress: this.#codeState.selectionProgress
		};
		const resolved =
			this.#range === DEFAULT
				? ALL_LINES
				: resolveRangeArray(this.#range, this.#codeState.resolved);
		this.#codeState.previousSelection = this.#snapshot.selection;
		this.#codeState.selection = resolved;
		this.#codeState.selectionProgress = 0;
	}

	setProgress(p: number) {
		this.#codeState.selectionProgress = clamp(p, 0, 1);
	}

	end() {
		this.#codeState.selectionProgress = null;
		this.#codeState.previousSelection = null;
	}

	revert() {
		if (!this.#snapshot) return;
		this.#codeState.selection = this.#snapshot.selection;
		this.#codeState.selectionProgress = this.#snapshot.selectionProgress;
		this.#codeState.previousSelection = null;
		this.#snapshot = null;
	}
}
