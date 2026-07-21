export function clamp(v: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function easeInOut(t: number): number {
	return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export function easeOut(t: number): number {
	return t * (2 - t);
}

export function easeOutCubic(t: number): number {
	return 1 - Math.pow(1 - t, 3);
}
