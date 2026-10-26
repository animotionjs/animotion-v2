import { clamp } from './easing.js';

export interface Point {
	x: number;
	y: number;
}

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Traces a centered rectangle. A smoothness above zero replaces the circular
 * corners with continuous curves, which reads calmer at large radii.
 */
export function roundedRectPath(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	radius: number,
	smoothness = 0,
	centerX = 0,
	centerY = 0
) {
	const left = centerX - width / 2;
	const top = centerY - height / 2;
	const right = centerX + width / 2;
	const bottom = centerY + height / 2;
	const r = Math.min(Math.max(0, radius), width / 2, height / 2);

	ctx.beginPath();
	if (r <= 0) {
		ctx.rect(left, top, width, height);
		return;
	}

	const smooth = clamp(smoothness, 0, 1);
	const control = r * Math.max(0, 0.5523 - smooth * 0.3);

	ctx.moveTo(left + r, top);
	ctx.lineTo(right - r, top);
	if (smooth > 0) {
		ctx.bezierCurveTo(right - control, top, right, top + control, right, top + r);
	} else {
		ctx.quadraticCurveTo(right, top, right, top + r);
	}

	ctx.lineTo(right, bottom - r);
	if (smooth > 0) {
		ctx.bezierCurveTo(right, bottom - control, right - control, bottom, right - r, bottom);
	} else {
		ctx.quadraticCurveTo(right, bottom, right - r, bottom);
	}

	ctx.lineTo(left + r, bottom);
	if (smooth > 0) {
		ctx.bezierCurveTo(left + control, bottom, left, bottom - control, left, bottom - r);
	} else {
		ctx.quadraticCurveTo(left, bottom, left, bottom - r);
	}

	ctx.lineTo(left, top + r);
	if (smooth > 0) {
		ctx.bezierCurveTo(left, top + control, left + control, top, left + r, top);
	} else {
		ctx.quadraticCurveTo(left, top, left + r, top);
	}
	ctx.closePath();
}

export function boundsFromPoints(points: readonly Point[]): Box {
	if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
	let left = Infinity;
	let top = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;
	for (const point of points) {
		left = Math.min(left, point.x);
		top = Math.min(top, point.y);
		right = Math.max(right, point.x);
		bottom = Math.max(bottom, point.y);
	}
	return { x: left, y: top, width: right - left, height: bottom - top };
}

export function unionBounds(first: Box | null, second: Box | null): Box {
	if (!first) return second ?? { x: 0, y: 0, width: 0, height: 0 };
	if (!second) return first;
	const left = Math.min(first.x, second.x);
	const top = Math.min(first.y, second.y);
	const right = Math.max(first.x + first.width, second.x + second.width);
	const bottom = Math.max(first.y + first.height, second.y + second.height);
	return { x: left, y: top, width: right - left, height: bottom - top };
}

export function expandBounds(bounds: Box, amount: number): Box {
	if (amount === 0) return bounds;
	return {
		x: bounds.x - amount,
		y: bounds.y - amount,
		width: bounds.width + amount * 2,
		height: bounds.height + amount * 2
	};
}

/** Transforms an axis aligned box through a node's local transform. */
export function transformBounds(
	bounds: Box,
	x: number,
	y: number,
	rotationDeg: number,
	scaleX: number,
	scaleY: number
): Box {
	const radians = (rotationDeg * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	const corners = [
		{ x: bounds.x, y: bounds.y },
		{ x: bounds.x + bounds.width, y: bounds.y },
		{ x: bounds.x + bounds.width, y: bounds.y + bounds.height },
		{ x: bounds.x, y: bounds.y + bounds.height }
	].map((corner) => {
		const px = corner.x * scaleX;
		const py = corner.y * scaleY;
		return {
			x: x + px * cos - py * sin,
			y: y + px * sin + py * cos
		};
	});
	return boundsFromPoints(corners);
}

/** Catmull Rom control points for a smooth path through the given knots. */
export function catmullRom(
	points: readonly Point[],
	index: number,
	closed: boolean
): { previous: Point; current: Point; next: Point; after: Point } | null {
	if (points.length < 2) return null;
	const count = points.length;
	const current = points[index % count]!;
	const next = points[(index + 1) % count]!;

	const previousIndex = index - 1;
	const afterIndex = index + 2;
	const hasPrevious = closed || previousIndex >= 0;
	const hasAfter = closed || afterIndex < count;

	return {
		previous: hasPrevious ? points[(previousIndex + count) % count]! : current,
		current,
		next,
		after: hasAfter ? points[afterIndex % count]! : next
	};
}
