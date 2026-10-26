export interface GradientStop {
	offset: number;
	color: string;
}

export interface LinearGradientPaint {
	type: 'linear';
	/** Start point in normalized box coordinates. Defaults to the top left. */
	from?: { x: number; y: number };
	/** End point in normalized box coordinates. Defaults to the bottom right. */
	to?: { x: number; y: number };
	stops: GradientStop[];
}

export interface RadialGradientPaint {
	type: 'radial';
	/** Center in normalized box coordinates. Defaults to the middle. */
	center?: { x: number; y: number };
	/** Radius as a fraction of the box's half diagonal. Defaults to `0.5`. */
	radius?: number;
	stops: GradientStop[];
}

export interface ConicGradientPaint {
	type: 'conic';
	/** Center in normalized box coordinates. Defaults to the middle. */
	center?: { x: number; y: number };
	/** Start angle in radians. Defaults to zero. */
	startAngle?: number;
	stops: GradientStop[];
}

export type PatternRepeat = 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat';

export interface PatternPaint {
	type: 'pattern';
	/** An image URL or an already decoded canvas source. */
	image: string | CanvasImageSource;
	repetition?: PatternRepeat;
	/** Scales the pattern in user space. Defaults to one. */
	scale?: number;
	/** Shifts the pattern in user space. */
	offset?: { x: number; y: number };
	/** Shown while a URL is still loading. */
	fallback?: string;
}

export type GradientPaint = LinearGradientPaint | RadialGradientPaint | ConicGradientPaint;

/** A solid color, a gradient, or a repeated image, resolved against a node box. */
export type Paint = string | GradientPaint | PatternPaint;

export type PaintStyle = string | CanvasGradient | CanvasPattern;

export interface Shadow {
	color?: string;
	blur?: number;
	offsetX?: number;
	offsetY?: number;
}

interface PatternImage {
	image: HTMLImageElement;
	loaded: boolean;
	failed: boolean;
	listeners: Set<() => void>;
}

const patternImages = new Map<string, PatternImage>();
let patternVersion = 0;

/** Changes whenever an async pattern image finishes loading. */
export function getPaintVersion(): number {
	return patternVersion;
}

function loadPatternImage(src: string, requestDraw?: () => void): PatternImage | null {
	if (typeof Image === 'undefined') return null;
	let entry = patternImages.get(src);
	if (!entry) {
		const image = new Image();
		image.decoding = 'async';
		entry = { image, loaded: false, failed: false, listeners: new Set() };
		image.onload = () => {
			if (!entry) return;
			entry.loaded = true;
			patternVersion += 1;
			for (const listener of entry.listeners) listener();
			entry.listeners.clear();
		};
		image.onerror = () => {
			if (!entry) return;
			entry.failed = true;
			patternVersion += 1;
			for (const listener of entry.listeners) listener();
			entry.listeners.clear();
		};
		image.src = src;
		patternImages.set(src, entry);
	}
	if (requestDraw && !entry.loaded && !entry.failed) entry.listeners.add(requestDraw);
	return entry;
}

export function applyShadow(ctx: CanvasRenderingContext2D, shadow: Shadow | null) {
	if (!shadow) return;
	ctx.shadowColor = shadow.color ?? 'rgba(0, 0, 0, 0.5)';
	ctx.shadowBlur = shadow.blur ?? 24;
	ctx.shadowOffsetX = shadow.offsetX ?? 0;
	ctx.shadowOffsetY = shadow.offsetY ?? 0;
}

export function clearShadow(ctx: CanvasRenderingContext2D) {
	ctx.shadowColor = 'transparent';
	ctx.shadowBlur = 0;
	ctx.shadowOffsetX = 0;
	ctx.shadowOffsetY = 0;
}

function addStops(gradient: CanvasGradient, stops: GradientStop[]) {
	if (stops.length === 0) {
		gradient.addColorStop(0, 'transparent');
		return;
	}
	for (const stop of stops) {
		gradient.addColorStop(Math.min(1, Math.max(0, stop.offset)), stop.color);
	}
}

function resolvePattern(
	ctx: CanvasRenderingContext2D,
	paint: PatternPaint,
	requestDraw?: () => void
): PaintStyle {
	let source: CanvasImageSource;
	if (typeof paint.image === 'string') {
		const entry = loadPatternImage(paint.image, requestDraw);
		if (!entry || !entry.loaded || entry.failed) return paint.fallback ?? 'transparent';
		source = entry.image;
	} else {
		source = paint.image;
	}

	const pattern = ctx.createPattern(source, paint.repetition ?? 'repeat');
	if (!pattern) return paint.fallback ?? 'transparent';

	const scale = paint.scale ?? 1;
	const offset = paint.offset ?? { x: 0, y: 0 };
	if ((scale !== 1 || offset.x !== 0 || offset.y !== 0) && typeof DOMMatrix !== 'undefined') {
		const matrix = new DOMMatrix();
		matrix.translateSelf(offset.x, offset.y);
		matrix.scaleSelf(scale, scale);
		pattern.setTransform(matrix);
	}
	return pattern;
}

/**
 * Turns a paint into a value the canvas accepts. Gradients and patterns are
 * created in the given box, with `left`/`top` marking its top left corner.
 */
export function resolvePaint(
	ctx: CanvasRenderingContext2D,
	paint: Paint,
	width: number,
	height: number,
	left = 0,
	top = 0,
	requestDraw?: () => void
): PaintStyle {
	if (typeof paint === 'string') return paint;

	if (paint.type === 'linear') {
		const from = paint.from ?? { x: 0, y: 0 };
		const to = paint.to ?? { x: 1, y: 1 };
		const gradient = ctx.createLinearGradient(
			left + from.x * width,
			top + from.y * height,
			left + to.x * width,
			top + to.y * height
		);
		addStops(gradient, paint.stops);
		return gradient;
	}

	if (paint.type === 'conic') {
		const center = paint.center ?? { x: 0.5, y: 0.5 };
		const gradient = ctx.createConicGradient(
			paint.startAngle ?? 0,
			left + center.x * width,
			top + center.y * height
		);
		addStops(gradient, paint.stops);
		return gradient;
	}

	if (paint.type === 'pattern') {
		return resolvePattern(ctx, paint, requestDraw);
	}

	const center = paint.center ?? { x: 0.5, y: 0.5 };
	const radius = (paint.radius ?? 0.5) * Math.hypot(width, height);
	const gradient = ctx.createRadialGradient(
		left + center.x * width,
		top + center.y * height,
		0,
		left + center.x * width,
		top + center.y * height,
		Math.max(1, radius)
	);
	addStops(gradient, paint.stops);
	return gradient;
}

/**
 * Nudges a text anchor onto the device pixel grid. Canvas rasterizes glyphs
 * differently at fractional positions, which makes letters look uneven at
 * rest and shimmer while they move.
 */
export function snapTextPoint(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number
): { x: number; y: number } {
	const matrix = ctx.getTransform();
	if (
		!Number.isFinite(matrix.a) ||
		!Number.isFinite(matrix.d) ||
		Math.abs(matrix.b) > 1e-6 ||
		Math.abs(matrix.c) > 1e-6
	) {
		return { x, y };
	}

	const deviceX = matrix.a * x + matrix.e;
	const deviceY = matrix.d * y + matrix.f;
	const scaleX = Math.abs(matrix.a) > 1e-6 ? matrix.a : 1;
	const scaleY = Math.abs(matrix.d) > 1e-6 ? matrix.d : 1;
	return {
		x: x + (Math.round(deviceX) - deviceX) / scaleX,
		y: y + (Math.round(deviceY) - deviceY) / scaleY
	};
}
