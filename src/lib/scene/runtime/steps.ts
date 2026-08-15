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

/** Visual transition applied to entering/exiting `data-layout` elements. */
export type LayoutTransition = 'fade' | 'scale' | 'clip' | 'wipe' | 'slide' | 'none';

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
	 * Removed elements finish leaving quickly instead of lingering
	 * half-visible for the rest of the step. Defaults to `0.1`.
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
type ParentScale = { x0: number; y0: number };

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
}

/** A removed element's fixed-position ghost animating out. */
interface ExitTween {
	el: HTMLElement;
	mode: 'exit';
	transition: LayoutTransition;
	props: LayoutPropTween[];
	/** The element's 0-based position among the step's exiting elements. */
	staggerIndex: number;
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
	/**
	 * The text glyph ink position (Range over the contents), distinct from the
	 * layout box because the ink sits at a different offset within the box at
	 * different font sizes. Only present for direct-text elements.
	 */
	ink?: { left: number; top: number };
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
		wordSpacing: computed.wordSpacing
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
 * way a text-size change animates) regardless of the `scale` option.
 */
function morphsSize(prev: LayoutBounds, last: Pick<LayoutBounds, 'el' | 'rect' | 'text'>): boolean {
	const fontChanged = prev.text.fontSize !== last.text.fontSize;
	return (
		(prev.rect.width !== last.rect.width || prev.rect.height !== last.rect.height) &&
		!(hasDirectText(last.el) && !fontChanged)
	);
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
	direction: 'enter' | 'exit'
): { opacity?: number; transform?: string; clipPath?: string } {
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
		this.#exitEnd = clamp(options.exitEnd ?? 0.1, 0, 1);
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
					tween.el.style.transform = `translate(${pxOffset}px, ${pyOffset}px) scale(${scaleX / sPx}, ${scaleY / sPy})`;
				} else if (tween.scale) {
					tween.el.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
				} else if (tween.offset && (tween.offset.x !== 0 || tween.offset.y !== 0)) {
					tween.el.style.transform = `translate(${dx}px, ${dy}px)`;
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
				const value = transitionValue(tween.transition, p, direction);
				if (value.opacity !== undefined) tween.el.style.opacity = String(value.opacity);
				if (value.transform !== undefined) tween.el.style.transform = value.transform;
				if (value.clipPath !== undefined) tween.el.style.clipPath = value.clipPath;
				// Exit ghosts leave the layout tree, so only entered elements
				// can sit under a scaling ancestor that needs counter-scaling.
				if (tween.mode === 'enter' && tween.parentScale) {
					// Counter-scale over the transition transform (applied last,
					// in the unscaled space) so the element stays crisp.
					const sPx = lerp(tween.parentScale.x0, 1, eased);
					const sPy = lerp(tween.parentScale.y0, 1, eased);
					const lx = tween.localFinal.x;
					const ly = tween.localFinal.y;
					const counter = `translate(${lx * (1 / sPx - 1)}px, ${
						ly * (1 / sPy - 1)
					}px) scale(${1 / sPx}, ${1 / sPy})`;
					tween.el.style.transform = value.transform ? `${value.transform} ${counter}` : counter;
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
				firstBounds.set(el.dataset.layout!, {
					el,
					rect,
					styles: snapshotLayoutStyles(el),
					text: snapshotTextMetrics(el),
					display: getComputedStyle(el).display,
					ink: textInkRect(el)
				});
			}
		}

		this.#change();
		flushSync();

		const lastElements = [...document.querySelectorAll('[data-layout]')] as HTMLElement[];
		const lastBounds = new Map<string, LayoutBounds>();
		for (const el of lastElements) {
			const rect = el.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				lastBounds.set(el.dataset.layout!, {
					el,
					rect,
					styles: snapshotLayoutStyles(el),
					text: snapshotTextMetrics(el),
					display: getComputedStyle(el).display,
					ink: textInkRect(el)
				});
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
					prev: prev
						? { left: prev.rect.left + border.left, top: prev.rect.top + border.top }
						: { left: 0, top: 0 },
					final: final
						? { left: final.rect.left + border.left, top: final.rect.top + border.top }
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
		const scaling = new Map<string, { x0: number; y0: number; x: number; y: number }>();
		for (const [key, { el, rect, text }] of lastBounds) {
			const prev = firstBounds.get(key);
			if (!prev) continue;
			const fontChanged = prev.text.fontSize !== text.fontSize;
			const sizeChanged = morphsSize(prev, { el, rect, text });
			if (!((this.#scale || (hasDirectText(el) && fontChanged)) && sizeChanged)) continue;
			const finalFont = parseFloat(text.fontSize);
			const uniform =
				hasDirectText(el) && fontChanged && finalFont > 0
					? parseFloat(prev.text.fontSize) / finalFont
					: undefined;
			scaling.set(key, {
				x0: uniform ?? prev.rect.width / rect.width,
				y0: uniform ?? prev.rect.height / rect.height,
				x: 1,
				y: 1
			});
		}

		const parentScaleOf = (el: HTMLElement) => {
			// Skip the element itself, mirroring `originOf`.
			const ancestor = el.parentElement?.closest('[data-layout]') as HTMLElement | null;
			return ancestor ? scaling.get(ancestor.dataset.layout!) : undefined;
		};

		for (const [key, { el, rect, styles, text, ink }] of lastBounds) {
			const prev = firstBounds.get(key);
			if (prev) {
				// Take the element out of flow so the container's size tween
				// can't re-lay-out it mid-animation (e.g. a flex row
				// re-distributing). It is pinned at its final bounds and moved
				// via a transform so position and size glide at float precision
				// instead of re-laying-out fractional geometry each frame.
				const origin = originOf(el);
				el.style.position = 'absolute';
				// `top`/`left` position the margin box, so margins would shift
				// the border box; drop them and place the border box directly.
				el.style.margin = '0';
				// Override min/max so they can't clamp the animated width/height.
				el.style.minWidth = 'auto';
				el.style.minHeight = 'auto';
				el.style.maxWidth = 'none';
				el.style.maxHeight = 'none';
				const finalLeft = rect.left - origin.final.left;
				const finalTop = rect.top - origin.final.top;
				// Pin at the final bounds so a shrink-wrapped box (e.g. an
				// absolutely-positioned text run that becomes a full-width block)
				// doesn't snap to its final size when the step ends.
				el.style.left = px(finalLeft);
				el.style.top = px(finalTop);
				el.style.width = px(rect.width);
				el.style.height = px(rect.height);
				const fontChanged = prev.text.fontSize !== text.fontSize;
				const sizeChanged = morphsSize(prev, { el, rect, text });
				const scale = scaling.get(key);
				const parentScale = parentScaleOf(el);
				const props: LayoutPropTween[] = [];
				// Measured as a local delta, not absolute: an ancestor that moves
				// exactly as much as the element's own reflow (leaving its
				// absolute spot unchanged) still needs the parent-scale
				// compensation computed from the local shift, or the child
				// glides under the counter-scale.
				const offset = {
					x: prev.rect.left - origin.prev.left - finalLeft,
					y: prev.rect.top - origin.prev.top - finalTop
				};
				if (scale && fontChanged && prev.ink && ink) {
					// The glyph ink sits at a different offset within the box at
					// each font size, so aligning the boxes leaves the text a few
					// pixels off on the first frame. Shift the offset so the
					// uniformly-scaled text lands on the previous ink instead.
					const finalFont = parseFloat(text.fontSize);
					if (finalFont > 0) {
						const r = parseFloat(prev.text.fontSize) / finalFont;
						offset.x += prev.ink.left - prev.rect.left - (ink.left - rect.left) * r;
						offset.y += prev.ink.top - prev.rect.top - (ink.top - rect.top) * r;
					}
				}
				// `scale: false` opts into morphing width/height so nested text
				// and images rasterize at native size at the cost of per-frame
				// re-layout; the default pins the final size and scales the box
				// back, keeping the motion on the compositor.
				const size =
					!scale && sizeChanged
						? {
								fromW: prev.rect.width,
								fromH: prev.rect.height,
								toW: rect.width,
								toH: rect.height
							}
						: undefined;
				if (scale || parentScale) el.style.transformOrigin = 'top left';
				for (const prop of Object.keys(LAYOUT_PROPS)) {
					let tween = createLayoutPropTween(
						prop,
						prev.styles[prop],
						styles[prop],
						prop === 'border-radius' ? Math.min(rect.width, rect.height) / 2 : undefined
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
					localFinal: { x: finalLeft, y: finalTop }
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
				const origin = originOf(el);
				const left = rect.left - origin.final.left;
				const top = rect.top - origin.final.top;
				el.style.position = 'absolute';
				el.style.margin = '0';
				el.style.left = px(left);
				el.style.top = px(top);
				el.style.width = px(rect.width);
				el.style.height = px(rect.height);
				this.#applyStart(el, this.#enter, 'enter');
				const parentScale = parentScaleOf(el);
				if (parentScale) el.style.transformOrigin = 'top left';
				this.#tweens.push({
					el,
					mode: 'enter',
					transition: this.#enter,
					props: [],
					parentScale,
					localFinal: { x: left, y: top },
					staggerIndex: enterCount++
				});
			}
		}

		for (const [key, { el, rect, text, display }] of firstBounds) {
			if (lastBounds.has(key)) continue;
			if (this.#exit === 'none') continue;
			// An exiting element already lives inside its data-layout
			// ancestor's ghost clone, so a second ghost would render the
			// content twice (e.g. a nested text span duplicated on exit).
			const ancestor = el.parentElement?.closest('[data-layout]');
			const ancestorKey = ancestor?.getAttribute('data-layout') ?? '';
			if (ancestor && firstBounds.has(ancestorKey) && !lastBounds.has(ancestorKey)) continue;
			const ghost = this.#createGhost(el, rect, text, display);
			this.#applyStart(ghost, this.#exit, 'exit');
			this.#tweens.push({
				el: ghost,
				mode: 'exit',
				transition: this.#exit,
				props: [],
				staggerIndex: exitCount++
			});
		}

		// Snap every tween to its start state so the first painted frame shows
		// the previous bounds (the transform pinning is only applied here).
		this.setProgress(0);
	}

	#applyStart(el: HTMLElement, transition: LayoutTransition, direction: 'enter' | 'exit') {
		if (transition === 'scale') el.style.transformOrigin = 'center';
		const value = transitionValue(transition, 0, direction);
		if (value.opacity !== undefined) el.style.opacity = String(value.opacity);
		if (value.transform !== undefined) el.style.transform = value.transform;
		if (value.clipPath !== undefined) el.style.clipPath = value.clipPath;
	}

	#createGhost(
		el: HTMLElement,
		rect: DOMRect,
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
		ghost.style.position = 'fixed';
		ghost.style.left = `${rect.left}px`;
		ghost.style.top = `${rect.top}px`;
		ghost.style.width = `${rect.width}px`;
		ghost.style.height = `${rect.height}px`;
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
			tween.el.style.transform = '';
			tween.el.style.clipPath = '';
			tween.el.style.transformOrigin = '';
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
			for (const prop of Object.keys(LAYOUT_PROPS)) tween.el.style.setProperty(prop, '');
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
