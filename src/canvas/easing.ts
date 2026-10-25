export type Easing = (t: number) => number;

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function lerp(from: number, to: number, t: number): number {
	return from + (to - from) * t;
}

export const linear: Easing = (t) => t;

export const easeOut: Easing = (t) => 1 - Math.pow(1 - t, 3);

export const easeIn: Easing = (t) => t * t * t;

export const easeInOut: Easing = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
