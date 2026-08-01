export function clamp(v: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function easeInOut(p: number): number {
	return p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
}

export function easeOut(p: number): number {
	return p * (2 - p);
}

export function easeOutCubic(p: number): number {
	return 1 - Math.pow(1 - p, 3);
}

export function clampRemap(
	v: number,
	inMin: number,
	inMax: number,
	outMin: number,
	outMax: number
): number {
	return outMin + (outMax - outMin) * clamp((v - inMin) / (inMax - inMin), 0, 1);
}

export function easeInOutSine(p: number): number {
	return -(Math.cos(Math.PI * p) - 1) / 2;
}
