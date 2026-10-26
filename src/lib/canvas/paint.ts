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

export type GradientPaint = LinearGradientPaint | RadialGradientPaint;

/** A solid color or a gradient resolved against the node's box. */
export type Paint = string | GradientPaint;

export interface Shadow {
	color?: string;
	blur?: number;
	offsetX?: number;
	offsetY?: number;
}

export function applyShadow(ctx: CanvasRenderingContext2D, shadow: Shadow | null) {
	if (!shadow) return;
	ctx.shadowColor = shadow.color ?? 'rgba(0, 0, 0, 0.5)';
	ctx.shadowBlur = shadow.blur ?? 24;
	ctx.shadowOffsetX = shadow.offsetX ?? 0;
	ctx.shadowOffsetY = shadow.offsetY ?? 12;
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

/**
 * Turns a paint into a value the canvas accepts. Gradients are created in the
 * given box, with `left`/`top` marking its top left corner.
 */
export function resolvePaint(
	ctx: CanvasRenderingContext2D,
	paint: Paint,
	width: number,
	height: number,
	left = 0,
	top = 0
): string | CanvasGradient {
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
