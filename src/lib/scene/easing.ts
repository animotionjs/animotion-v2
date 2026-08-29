/**
 * A function mapping normalized progress to an eased value.
 *
 * Inputs are not clamped internally; back and elastic easings can return
 * values outside `0..1`. Clamp first if a strict range is required.
 */
export type Easing = (p: number) => number;

/**
 * Clamps `v` into `[min, max]`.
 *
 * @returns the nearest bound when `v` is out of range
 */
export function clamp(v: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, v));
}

/**
 * Linearly interpolates between `a` and `b` by `t`.
 *
 * @param t - interpolation factor; not clamped, so `t > 1` extrapolates
 */
export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/**
 * Remaps `v` from `[inMin, inMax]` to `[outMin, outMax]`.
 *
 * Output is clamped, so `v` outside the input range never leaves the output
 * range.
 */
export function clampRemap(
	v: number,
	inMin: number,
	inMax: number,
	outMin: number,
	outMax: number
): number {
	return outMin + (outMax - outMin) * clamp((v - inMin) / (inMax - inMin), 0, 1);
}

const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;
const c5 = (2 * Math.PI) / 4.5;

export function linear(p: number): number {
	return p;
}

export function easeInQuad(p: number): number {
	return p * p;
}

export function easeOutQuad(p: number): number {
	return p * (2 - p);
}

export function easeInOutQuad(p: number): number {
	return p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
}

export function easeInCubic(p: number): number {
	return p * p * p;
}

export function easeOutCubic(p: number): number {
	return 1 - Math.pow(1 - p, 3);
}

export function easeInOutCubic(p: number): number {
	return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export function easeInQuart(p: number): number {
	return p * p * p * p;
}

export function easeOutQuart(p: number): number {
	return 1 - Math.pow(1 - p, 4);
}

export function easeInOutQuart(p: number): number {
	return p < 0.5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2;
}

export function easeInQuint(p: number): number {
	return p * p * p * p * p;
}

export function easeOutQuint(p: number): number {
	return 1 - Math.pow(1 - p, 5);
}

export function easeInOutQuint(p: number): number {
	return p < 0.5 ? 16 * p * p * p * p * p : 1 - Math.pow(-2 * p + 2, 5) / 2;
}

export function easeInSine(p: number): number {
	return 1 - Math.cos((p * Math.PI) / 2);
}

export function easeOutSine(p: number): number {
	return Math.sin((p * Math.PI) / 2);
}

export function easeInOutSine(p: number): number {
	return -(Math.cos(Math.PI * p) - 1) / 2;
}

export function easeInExpo(p: number): number {
	return p === 0 ? 0 : Math.pow(2, 10 * p - 10);
}

export function easeOutExpo(p: number): number {
	return p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
}

export function easeInOutExpo(p: number): number {
	if (p === 0) return 0;
	if (p === 1) return 1;
	if (p < 0.5) return Math.pow(2, 20 * p - 10) / 2;
	return (2 - Math.pow(2, -20 * p + 10)) / 2;
}

export function easeInCirc(p: number): number {
	return 1 - Math.sqrt(1 - Math.pow(p, 2));
}

export function easeOutCirc(p: number): number {
	return Math.sqrt(1 - Math.pow(p - 1, 2));
}

export function easeInOutCirc(p: number): number {
	return p < 0.5
		? (1 - Math.sqrt(1 - Math.pow(2 * p, 2))) / 2
		: (Math.sqrt(1 - Math.pow(-2 * p + 2, 2)) + 1) / 2;
}

/** Eases in with a spring; dips below `0` before settling at `1`. */
export function easeInBack(p: number): number {
	return c3 * p * p * p - c1 * p * p;
}

/** Eases out with a spring; overshoots above `1` before settling. */
export function easeOutBack(p: number): number {
	return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

/** Symmetric spring; overshoots both ends of `0..1`. */
export function easeInOutBack(p: number): number {
	return p < 0.5
		? (Math.pow(2 * p, 2) * ((c2 + 1) * 2 * p - c2)) / 2
		: (Math.pow(2 * p - 2, 2) * ((c2 + 1) * (p * 2 - 2) + c2) + 2) / 2;
}

/** Eases in with decaying oscillations; dips below `0`. */
export function easeInElastic(p: number): number {
	if (p === 0) return 0;
	if (p === 1) return 1;
	return -Math.pow(2, 10 * p - 10) * Math.sin((p * 10 - 10.75) * c4);
}

/** Eases out with decaying oscillations; overshoots above `1`. */
export function easeOutElastic(p: number): number {
	if (p === 0) return 0;
	if (p === 1) return 1;
	return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * c4) + 1;
}

/** Symmetric elastic; oscillates on both ends of `0..1`. */
export function easeInOutElastic(p: number): number {
	if (p === 0) return 0;
	if (p === 1) return 1;
	if (p < 0.5) return -(Math.pow(2, 20 * p - 10) * Math.sin((20 * p - 11.125) * c5)) / 2;
	return (Math.pow(2, -20 * p + 10) * Math.sin((20 * p - 11.125) * c5)) / 2 + 1;
}

const n1 = 7.5625;
const d1 = 2.75;

/** Eases in by bouncing. */
export function easeInBounce(p: number): number {
	return 1 - easeOutBounce(1 - p);
}

/** Eases out by bouncing; stays within `0..1`. */
export function easeOutBounce(p: number): number {
	if (p < 1 / d1) return n1 * p * p;
	if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
	if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
	return n1 * (p -= 2.625 / d1) * p + 0.984375;
}

/** Symmetric bounce; stays within `0..1`. */
export function easeInOutBounce(p: number): number {
	return p < 0.5 ? (1 - easeOutBounce(1 - 2 * p)) / 2 : (1 + easeOutBounce(2 * p - 1)) / 2;
}

/** Alias for {@link easeInOutQuad}. */
export const easeInOut = easeInOutQuad;
/** Alias for {@link easeOutQuad}. */
export const easeOut = easeOutQuad;
