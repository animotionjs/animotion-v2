import { clamp } from './easing.js';
import { boundsFromPoints, catmullRom, expandBounds, type Box, type Point } from './geometry.js';
import { Node, type NodeInit, type NodeState, type Size } from './nodes.js';
import { resolvePaint, type Paint } from './paint.js';
import { createSignal, discreteInterpolate, numberSignal, type Signal } from './signal.js';

export interface ShapeInit extends NodeInit {
	fill?: Paint | null;
	stroke?: Paint | null;
	strokeWidth?: number;
	lineCap?: CanvasLineCap;
	lineJoin?: CanvasLineJoin;
	/** Dash lengths in local units, or an empty list for a solid line. */
	dash?: number[];
	dashOffset?: number;
}

export abstract class ShapeNode extends Node {
	fill: Signal<Paint | null>;
	stroke: Signal<Paint | null>;
	strokeWidth: Signal<number>;
	lineCap: Signal<CanvasLineCap>;
	lineJoin: Signal<CanvasLineJoin>;
	dash: Signal<number[]>;
	dashOffset: Signal<number>;

	constructor(init: ShapeInit) {
		super(init);
		this.fill = createSignal<Paint | null>(
			init.fill ?? null,
			discreteInterpolate,
			`${this.id}.fill`
		);
		this.stroke = createSignal<Paint | null>(
			init.stroke ?? null,
			discreteInterpolate,
			`${this.id}.stroke`
		);
		this.strokeWidth = numberSignal(init.strokeWidth ?? 0, `${this.id}.strokeWidth`);
		this.lineCap = createSignal(init.lineCap ?? 'round', discreteInterpolate, `${this.id}.lineCap`);
		this.lineJoin = createSignal(
			init.lineJoin ?? 'round',
			discreteInterpolate,
			`${this.id}.lineJoin`
		);
		this.dash = createSignal<number[]>(init.dash ?? [], discreteInterpolate, `${this.id}.dash`);
		this.dashOffset = numberSignal(init.dashOffset ?? 0, `${this.id}.dashOffset`);
	}

	/** The unpainted path box in local coordinates. */
	abstract localBox(): Box;

	/** Adds the shape to the current context path. */
	protected abstract buildPath(ctx: CanvasRenderingContext2D): void;

	/** A prebuilt path for formats such as SVG path data. */
	protected path2d(): Path2D | null {
		return null;
	}

	protected trace(ctx: CanvasRenderingContext2D) {
		const path = this.path2d();
		if (path) return path;
		ctx.beginPath();
		this.buildPath(ctx);
		return null;
	}

	override selfBounds(): Box {
		let bounds = this.localBox();
		const stroke = this.strokeWidth();
		if (stroke > 0) bounds = expandBounds(bounds, stroke / 2);
		const shadow = this.shadow();
		if (shadow) {
			const blur = (shadow.blur ?? 24) * 2;
			const offset = Math.max(Math.abs(shadow.offsetX ?? 0), Math.abs(shadow.offsetY ?? 0));
			bounds = expandBounds(bounds, blur + offset);
		}
		return bounds;
	}

	protected override clipBounds(): Box {
		return this.localBox();
	}

	protected override applyClip(ctx: CanvasRenderingContext2D) {
		const path = this.trace(ctx);
		if (path) ctx.clip(path);
		else ctx.clip();
	}

	measure(): Size {
		const bounds = this.localBox();
		return { width: bounds.width, height: bounds.height };
	}

	override saveState(): NodeState {
		return {
			...super.saveState(),
			fill: this.fill(),
			stroke: this.stroke(),
			strokeWidth: this.strokeWidth(),
			lineCap: this.lineCap(),
			lineJoin: this.lineJoin(),
			dash: this.dash(),
			dashOffset: this.dashOffset()
		};
	}

	override restoreState(state: NodeState) {
		super.restoreState(state);
		if (state.fill === null || typeof state.fill === 'string' || typeof state.fill === 'object') {
			this.fill(state.fill as Paint | null);
		}
		if (
			state.stroke === null ||
			typeof state.stroke === 'string' ||
			typeof state.stroke === 'object'
		) {
			this.stroke(state.stroke as Paint | null);
		}
		if (typeof state.strokeWidth === 'number') this.strokeWidth(state.strokeWidth);
		if (typeof state.lineCap === 'string') this.lineCap(state.lineCap as CanvasLineCap);
		if (typeof state.lineJoin === 'string') this.lineJoin(state.lineJoin as CanvasLineJoin);
		if (Array.isArray(state.dash)) {
			this.dash(state.dash.filter((value): value is number => typeof value === 'number'));
		}
		if (typeof state.dashOffset === 'number') this.dashOffset(state.dashOffset);
	}

	drawSelf(ctx: CanvasRenderingContext2D) {
		const bounds = this.localBox();
		const width = Math.max(1, bounds.width);
		const height = Math.max(1, bounds.height);
		const path = this.trace(ctx);

		const fill = this.fill();
		if (fill) {
			ctx.fillStyle = resolvePaint(ctx, fill, width, height, bounds.x, bounds.y, () =>
				this.requestDraw()
			);
			if (path) ctx.fill(path);
			else ctx.fill();
		}

		const stroke = this.stroke();
		if (stroke && this.strokeWidth() > 0) {
			ctx.save();
			ctx.strokeStyle = resolvePaint(ctx, stroke, width, height, bounds.x, bounds.y, () =>
				this.requestDraw()
			);
			ctx.lineWidth = this.strokeWidth();
			ctx.lineCap = this.lineCap();
			ctx.lineJoin = this.lineJoin();
			ctx.setLineDash(this.dash());
			ctx.lineDashOffset = this.dashOffset();
			if (path) ctx.stroke(path);
			else ctx.stroke();
			ctx.restore();
		}
	}
}

export interface CircleInit extends ShapeInit {
	radius: number;
	/** Start angle in degrees. Defaults to zero. */
	startAngle?: number;
	/** End angle in degrees. Defaults to a full turn. */
	endAngle?: number;
	/** Closes an arc through the center, which makes a pie slice. */
	closed?: boolean;
}

export class CircleNode extends ShapeNode {
	override readonly kind = 'circle';
	readonly radius: Signal<number>;
	readonly startAngle: Signal<number>;
	readonly endAngle: Signal<number>;
	readonly closed: Signal<boolean>;

	constructor(init: CircleInit) {
		super(init);
		this.radius = numberSignal(init.radius, `${this.id}.radius`);
		this.startAngle = numberSignal(init.startAngle ?? 0, `${this.id}.startAngle`);
		this.endAngle = numberSignal(init.endAngle ?? 360, `${this.id}.endAngle`);
		this.closed = createSignal(init.closed ?? false, discreteInterpolate, `${this.id}.closed`);
	}

	#full(): boolean {
		return Math.abs(this.endAngle() - this.startAngle()) >= 360 - 1e-6;
	}

	localBox(): Box {
		const radius = Math.abs(this.radius());
		return { x: -radius, y: -radius, width: radius * 2, height: radius * 2 };
	}

	protected buildPath(ctx: CanvasRenderingContext2D) {
		const radius = Math.max(0, Math.abs(this.radius()));
		const start = (this.startAngle() * Math.PI) / 180;
		const end = (this.endAngle() * Math.PI) / 180;
		ctx.arc(0, 0, radius, start, end, false);
		if (this.closed() && !this.#full()) {
			ctx.lineTo(0, 0);
			ctx.closePath();
		}
	}

	override saveState(): NodeState {
		return {
			...super.saveState(),
			radius: this.radius(),
			startAngle: this.startAngle(),
			endAngle: this.endAngle(),
			closed: this.closed()
		};
	}

	override restoreState(state: NodeState) {
		super.restoreState(state);
		if (typeof state.radius === 'number') this.radius(state.radius);
		if (typeof state.startAngle === 'number') this.startAngle(state.startAngle);
		if (typeof state.endAngle === 'number') this.endAngle(state.endAngle);
		if (typeof state.closed === 'boolean') this.closed(state.closed);
	}
}

export interface LineInit extends ShapeInit {
	points: Point[];
	closed?: boolean;
}

export class LineNode extends ShapeNode {
	override readonly kind: string = 'line';
	readonly points: Signal<Point[]>;
	readonly closed: Signal<boolean>;

	constructor(init: LineInit) {
		super(init);
		this.points = createSignal<Point[]>(init.points, discreteInterpolate, `${this.id}.points`);
		this.closed = createSignal(init.closed ?? false, discreteInterpolate, `${this.id}.closed`);
	}

	localBox(): Box {
		return boundsFromPoints(this.points());
	}

	protected buildPath(ctx: CanvasRenderingContext2D) {
		const points = this.points();
		if (points.length === 0) return;
		ctx.moveTo(points[0]!.x, points[0]!.y);
		for (let index = 1; index < points.length; index++) {
			ctx.lineTo(points[index]!.x, points[index]!.y);
		}
		if (this.closed()) ctx.closePath();
	}

	override saveState(): NodeState {
		return {
			...super.saveState(),
			points: this.points(),
			closed: this.closed()
		};
	}

	override restoreState(state: NodeState) {
		super.restoreState(state);
		if (Array.isArray(state.points)) {
			this.points(
				state.points.filter(
					(point): point is Point =>
						typeof point === 'object' &&
						point !== null &&
						typeof (point as Point).x === 'number' &&
						typeof (point as Point).y === 'number'
				)
			);
		}
		if (typeof state.closed === 'boolean') this.closed(state.closed);
	}
}

export class PolygonNode extends LineNode {
	override readonly kind = 'polygon';

	constructor(init: Omit<LineInit, 'closed'> & { closed?: boolean }) {
		super({ ...init, closed: init.closed ?? true });
	}
}

export interface SplineInit extends LineInit {
	/** Curve strength from zero to one. Defaults to one. */
	tension?: number;
}

export class SplineNode extends LineNode {
	override readonly kind = 'spline';
	readonly tension: Signal<number>;

	constructor(init: SplineInit) {
		super(init);
		this.tension = numberSignal(init.tension ?? 1, `${this.id}.tension`);
	}

	protected override buildPath(ctx: CanvasRenderingContext2D) {
		const points = this.points();
		if (points.length === 0) return;
		ctx.moveTo(points[0]!.x, points[0]!.y);
		if (points.length === 1) return;

		const closed = this.closed();
		const tension = clamp(this.tension(), 0, 1) / 6;
		const segments = closed ? points.length : points.length - 1;
		for (let index = 0; index < segments; index++) {
			const knot = catmullRom(points, index, closed);
			if (!knot) continue;
			ctx.bezierCurveTo(
				knot.current.x + (knot.next.x - knot.previous.x) * tension,
				knot.current.y + (knot.next.y - knot.previous.y) * tension,
				knot.next.x - (knot.after.x - knot.current.x) * tension,
				knot.next.y - (knot.after.y - knot.current.y) * tension,
				knot.next.x,
				knot.next.y
			);
		}
		if (closed) ctx.closePath();
	}

	override saveState(): NodeState {
		return {
			...super.saveState(),
			tension: this.tension()
		};
	}

	override restoreState(state: NodeState) {
		super.restoreState(state);
		if (typeof state.tension === 'number') this.tension(state.tension);
	}
}

export interface BezierInit extends ShapeInit {
	/** Two points for a line, three for a quadratic curve, or four for a cubic. */
	points: Point[];
}

export class BezierNode extends ShapeNode {
	override readonly kind = 'bezier';
	readonly points: Signal<Point[]>;

	constructor(init: BezierInit) {
		super(init);
		if (init.points.length < 2 || init.points.length > 4) {
			throw new Error('A bezier node needs two, three, or four points.');
		}
		this.points = createSignal<Point[]>(init.points, discreteInterpolate, `${this.id}.points`);
	}

	localBox(): Box {
		return boundsFromPoints(this.points());
	}

	protected buildPath(ctx: CanvasRenderingContext2D) {
		const points = this.points();
		if (points.length < 2) return;
		if (points.length === 2) {
			ctx.moveTo(points[0]!.x, points[0]!.y);
			ctx.lineTo(points[1]!.x, points[1]!.y);
			return;
		}
		if (points.length === 3) {
			ctx.moveTo(points[0]!.x, points[0]!.y);
			ctx.quadraticCurveTo(points[1]!.x, points[1]!.y, points[2]!.x, points[2]!.y);
			return;
		}
		ctx.moveTo(points[0]!.x, points[0]!.y);
		ctx.bezierCurveTo(
			points[1]!.x,
			points[1]!.y,
			points[2]!.x,
			points[2]!.y,
			points[3]!.x,
			points[3]!.y
		);
	}

	override saveState(): NodeState {
		return {
			...super.saveState(),
			points: this.points()
		};
	}

	override restoreState(state: NodeState) {
		super.restoreState(state);
		if (Array.isArray(state.points)) {
			this.points(
				state.points.filter(
					(point): point is Point =>
						typeof point === 'object' &&
						point !== null &&
						typeof (point as Point).x === 'number' &&
						typeof (point as Point).y === 'number'
				)
			);
		}
	}
}

export interface PathInit extends ShapeInit {
	/** SVG path data in local coordinates. */
	path: string;
	/** Optional explicit bounds for gradients and clipping. */
	bounds?: Box;
}

export class PathNode extends ShapeNode {
	override readonly kind = 'path';
	readonly path: Signal<string>;
	readonly bounds: Signal<Box | null>;
	#cachedPath: { source: string; value: Path2D } | null = null;

	constructor(init: PathInit) {
		super(init);
		this.path = createSignal(init.path, discreteInterpolate, `${this.id}.path`);
		this.bounds = createSignal<Box | null>(
			init.bounds ?? null,
			discreteInterpolate,
			`${this.id}.bounds`
		);
	}

	protected override path2d(): Path2D | null {
		const source = this.path();
		if (this.#cachedPath?.source === source) return this.#cachedPath.value;
		if (typeof Path2D === 'undefined') return null;
		const value = new Path2D(source);
		this.#cachedPath = { source, value };
		return value;
	}

	protected buildPath() {}

	localBox(): Box {
		const bounds = this.bounds();
		if (bounds) return bounds;

		const numbers = this.path()
			.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)
			?.map(Number);
		if (!numbers || numbers.length < 2) return { x: 0, y: 0, width: 0, height: 0 };
		const points: Point[] = [];
		for (let index = 0; index + 1 < numbers.length; index += 2) {
			points.push({ x: numbers[index]!, y: numbers[index + 1]! });
		}
		return boundsFromPoints(points);
	}

	override saveState(): NodeState {
		return {
			...super.saveState(),
			path: this.path(),
			bounds: this.bounds()
		};
	}

	override restoreState(state: NodeState) {
		super.restoreState(state);
		if (typeof state.path === 'string') this.path(state.path);
		if (state.bounds === null || (typeof state.bounds === 'object' && state.bounds !== null)) {
			this.bounds(state.bounds as Box | null);
		}
	}
}
