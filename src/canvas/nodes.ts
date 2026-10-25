import {
	createSignal,
	discreteInterpolate,
	numberSignal,
	stringSignal,
	type Signal
} from './signal.js';

export interface NodeInit {
	id?: string;
	layoutKey?: string;
	x?: number;
	y?: number;
	rotation?: number;
	scale?: number;
	opacity?: number;
	visible?: boolean;
}

export interface NodeValues {
	x?: number;
	y?: number;
	rotation?: number;
	scale?: number;
	opacity?: number;
	visible?: boolean;
}

export interface Size {
	width: number;
	height: number;
}

export type NodeState = Record<string, unknown>;

let nextNodeId = 0;

export abstract class Node {
	readonly id: string;
	readonly layoutKey: string | undefined;
	readonly kind: string = 'node';
	readonly x: Signal<number>;
	readonly y: Signal<number>;
	readonly rotation: Signal<number>;
	readonly scale: Signal<number>;
	readonly opacity: Signal<number>;
	readonly visible: Signal<boolean>;
	readonly layoutX: Signal<number>;
	readonly layoutY: Signal<number>;
	readonly layoutScaleX: Signal<number>;
	readonly layoutScaleY: Signal<number>;
	readonly layoutAlpha: Signal<number>;
	parent: Node | null = null;
	#children: Node[] = [];

	constructor(init: NodeInit = {}) {
		this.id = init.id ?? `node-${nextNodeId++}`;
		this.layoutKey = init.layoutKey;
		this.x = numberSignal(init.x ?? 0, `${this.id}.x`);
		this.y = numberSignal(init.y ?? 0, `${this.id}.y`);
		this.rotation = numberSignal(init.rotation ?? 0, `${this.id}.rotation`);
		this.scale = numberSignal(init.scale ?? 1, `${this.id}.scale`);
		this.opacity = numberSignal(init.opacity ?? 1, `${this.id}.opacity`);
		this.visible = createSignal(init.visible ?? true, discreteInterpolate, `${this.id}.visible`);
		this.layoutX = numberSignal(0, `${this.id}.layoutX`);
		this.layoutY = numberSignal(0, `${this.id}.layoutY`);
		this.layoutScaleX = numberSignal(1, `${this.id}.layoutScaleX`);
		this.layoutScaleY = numberSignal(1, `${this.id}.layoutScaleY`);
		this.layoutAlpha = numberSignal(1, `${this.id}.layoutAlpha`);
	}

	get children(): readonly Node[] {
		return this.#children;
	}

	add(...nodes: Node[]): this {
		for (const node of nodes) {
			node.detach();
			node.parent = this;
			this.#children.push(node);
		}
		return this;
	}

	remove(node: Node): this {
		const index = this.#children.indexOf(node);
		if (index === -1) return this;
		this.#children.splice(index, 1);
		node.parent = null;
		return this;
	}

	clear(): this {
		for (const child of this.#children) child.parent = null;
		this.#children = [];
		return this;
	}

	replaceChildren(nodes: readonly Node[]): this {
		this.clear();
		return this.add(...nodes);
	}

	detach(): this {
		this.parent?.remove(this);
		return this;
	}

	resetLayout(): this {
		this.layoutX(0);
		this.layoutY(0);
		this.layoutScaleX(1);
		this.layoutScaleY(1);
		this.layoutAlpha(1);
		return this;
	}

	saveState(): NodeState {
		return {
			x: this.x(),
			y: this.y(),
			rotation: this.rotation(),
			scale: this.scale(),
			opacity: this.opacity(),
			visible: this.visible(),
			layoutX: this.layoutX(),
			layoutY: this.layoutY(),
			layoutScaleX: this.layoutScaleX(),
			layoutScaleY: this.layoutScaleY(),
			layoutAlpha: this.layoutAlpha()
		};
	}

	restoreState(state: NodeState) {
		if (typeof state.x === 'number') this.x(state.x);
		if (typeof state.y === 'number') this.y(state.y);
		if (typeof state.rotation === 'number') this.rotation(state.rotation);
		if (typeof state.scale === 'number') this.scale(state.scale);
		if (typeof state.opacity === 'number') this.opacity(state.opacity);
		if (typeof state.visible === 'boolean') this.visible(state.visible);
		if (typeof state.layoutX === 'number') this.layoutX(state.layoutX);
		if (typeof state.layoutY === 'number') this.layoutY(state.layoutY);
		if (typeof state.layoutScaleX === 'number') this.layoutScaleX(state.layoutScaleX);
		if (typeof state.layoutScaleY === 'number') this.layoutScaleY(state.layoutScaleY);
		if (typeof state.layoutAlpha === 'number') this.layoutAlpha(state.layoutAlpha);
	}

	set(values: NodeValues): this {
		if (values.x !== undefined) this.x(values.x);
		if (values.y !== undefined) this.y(values.y);
		if (values.rotation !== undefined) this.rotation(values.rotation);
		if (values.scale !== undefined) this.scale(values.scale);
		if (values.opacity !== undefined) this.opacity(values.opacity);
		if (values.visible !== undefined) this.visible(values.visible);
		return this;
	}

	abstract measure(ctx: CanvasRenderingContext2D): Size;

	abstract drawSelf(ctx: CanvasRenderingContext2D): void;

	draw(ctx: CanvasRenderingContext2D) {
		const alpha = this.opacity() * this.layoutAlpha();
		if (!this.visible() || alpha <= 0) return;

		ctx.save();
		ctx.translate(this.x() + this.layoutX(), this.y() + this.layoutY());
		ctx.rotate((this.rotation() * Math.PI) / 180);
		ctx.scale(this.scale() * this.layoutScaleX(), this.scale() * this.layoutScaleY());
		ctx.globalAlpha *= alpha;

		this.drawSelf(ctx);
		for (const child of this.#children) child.draw(ctx);

		ctx.restore();
	}

	drawGhost(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, alpha: number) {
		if (alpha <= 0) return;

		ctx.save();
		ctx.translate(centerX, centerY);
		ctx.rotate((this.rotation() * Math.PI) / 180);
		ctx.scale(this.scale() * this.layoutScaleX(), this.scale() * this.layoutScaleY());
		ctx.globalAlpha *= alpha;

		this.drawSelf(ctx);
		for (const child of this.#children) child.draw(ctx);

		ctx.restore();
	}
}

export interface TextInit extends NodeInit {
	text: string;
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: number;
	fill?: string;
	align?: CanvasTextAlign;
}

export class TextNode extends Node {
	override readonly kind = 'text';
	readonly text: Signal<string>;
	readonly fontSize: Signal<number>;
	readonly fontFamily: Signal<string>;
	readonly fontWeight: Signal<number>;
	readonly fill: Signal<string>;
	readonly align: Signal<CanvasTextAlign>;

	constructor(init: TextInit) {
		super(init);
		this.text = stringSignal(init.text, `${this.id}.text`);
		this.fontSize = numberSignal(init.fontSize ?? 32, `${this.id}.fontSize`);
		this.fontFamily = stringSignal(
			init.fontFamily ?? 'system-ui, sans-serif',
			`${this.id}.fontFamily`
		);
		this.fontWeight = numberSignal(init.fontWeight ?? 400, `${this.id}.fontWeight`);
		this.fill = stringSignal(init.fill ?? '#fafafa', `${this.id}.fill`);
		this.align = createSignal(init.align ?? 'center', discreteInterpolate, `${this.id}.align`);
	}

	override saveState(): NodeState {
		return {
			...super.saveState(),
			text: this.text(),
			fontSize: this.fontSize(),
			fontFamily: this.fontFamily(),
			fontWeight: this.fontWeight(),
			fill: this.fill(),
			align: this.align()
		};
	}

	override restoreState(state: NodeState) {
		super.restoreState(state);
		if (typeof state.text === 'string') this.text(state.text);
		if (typeof state.fontSize === 'number') this.fontSize(state.fontSize);
		if (typeof state.fontFamily === 'string') this.fontFamily(state.fontFamily);
		if (typeof state.fontWeight === 'number') this.fontWeight(state.fontWeight);
		if (typeof state.fill === 'string') this.fill(state.fill);
		if (typeof state.align === 'string') this.align(state.align as CanvasTextAlign);
	}

	get font(): string {
		return `${this.fontWeight()} ${this.fontSize()}px ${this.fontFamily()}`;
	}

	measure(ctx: CanvasRenderingContext2D): Size {
		ctx.save();
		ctx.font = this.font;
		const metrics = ctx.measureText(this.text());
		ctx.restore();
		return { width: metrics.width, height: this.fontSize() * 1.2 };
	}

	drawSelf(ctx: CanvasRenderingContext2D) {
		ctx.save();
		ctx.font = this.font;
		ctx.fillStyle = this.fill();
		ctx.textAlign = this.align();
		ctx.textBaseline = 'middle';
		ctx.fillText(this.text(), 0, 0);
		ctx.restore();
	}
}

export interface RectInit extends NodeInit {
	width: number;
	height: number;
	radius?: number;
	fill?: string | null;
	stroke?: string | null;
	strokeWidth?: number;
}

export class RectNode extends Node {
	override readonly kind = 'rect';
	readonly width: Signal<number>;
	readonly height: Signal<number>;
	readonly radius: Signal<number>;
	readonly fill: Signal<string | null>;
	readonly stroke: Signal<string | null>;
	readonly strokeWidth: Signal<number>;

	constructor(init: RectInit) {
		super(init);
		this.width = numberSignal(init.width, `${this.id}.width`);
		this.height = numberSignal(init.height, `${this.id}.height`);
		this.radius = numberSignal(init.radius ?? 0, `${this.id}.radius`);
		this.fill = createSignal(init.fill ?? null, discreteInterpolate, `${this.id}.fill`);
		this.stroke = createSignal(init.stroke ?? null, discreteInterpolate, `${this.id}.stroke`);
		this.strokeWidth = numberSignal(init.strokeWidth ?? 0, `${this.id}.strokeWidth`);
	}

	measure(): Size {
		return { width: this.width(), height: this.height() };
	}

	override saveState(): NodeState {
		return {
			...super.saveState(),
			width: this.width(),
			height: this.height(),
			radius: this.radius(),
			fill: this.fill(),
			stroke: this.stroke(),
			strokeWidth: this.strokeWidth()
		};
	}

	override restoreState(state: NodeState) {
		super.restoreState(state);
		if (typeof state.width === 'number') this.width(state.width);
		if (typeof state.height === 'number') this.height(state.height);
		if (typeof state.radius === 'number') this.radius(state.radius);
		if (state.fill === null || typeof state.fill === 'string') this.fill(state.fill);
		if (state.stroke === null || typeof state.stroke === 'string') this.stroke(state.stroke);
		if (typeof state.strokeWidth === 'number') this.strokeWidth(state.strokeWidth);
	}

	drawSelf(ctx: CanvasRenderingContext2D) {
		const width = this.width();
		const height = this.height();
		const radius = Math.min(this.radius(), width / 2, height / 2);
		const left = -width / 2;
		const top = -height / 2;

		ctx.beginPath();
		ctx.moveTo(left + radius, top);
		ctx.lineTo(left + width - radius, top);
		ctx.quadraticCurveTo(left + width, top, left + width, top + radius);
		ctx.lineTo(left + width, top + height - radius);
		ctx.quadraticCurveTo(left + width, top + height, left + width - radius, top + height);
		ctx.lineTo(left + radius, top + height);
		ctx.quadraticCurveTo(left, top + height, left, top + height - radius);
		ctx.lineTo(left, top + radius);
		ctx.quadraticCurveTo(left, top, left + radius, top);
		ctx.closePath();

		const fill = this.fill();
		if (fill) {
			ctx.fillStyle = fill;
			ctx.fill();
		}

		const stroke = this.stroke();
		if (stroke && this.strokeWidth() > 0) {
			ctx.strokeStyle = stroke;
			ctx.lineWidth = this.strokeWidth();
			ctx.stroke();
		}
	}
}

export class GroupNode extends Node {
	override readonly kind = 'group';

	measure(ctx: CanvasRenderingContext2D): Size {
		let left = Infinity;
		let top = Infinity;
		let right = -Infinity;
		let bottom = -Infinity;

		for (const child of this.children) {
			const size = child.measure(ctx);
			const width = size.width * child.scale();
			const height = size.height * child.scale();
			const x = child.x();
			const y = child.y();
			left = Math.min(left, x - width / 2);
			top = Math.min(top, y - height / 2);
			right = Math.max(right, x + width / 2);
			bottom = Math.max(bottom, y + height / 2);
		}

		if (!Number.isFinite(left)) return { width: 0, height: 0 };
		return { width: right - left, height: bottom - top };
	}

	drawSelf() {}
}

export function text(content: string, init: Omit<TextInit, 'text'> = {}): TextNode {
	return new TextNode({ text: content, ...init });
}

export function rect(init: RectInit): RectNode {
	return new RectNode(init);
}

export function group(init: NodeInit = {}, ...children: Node[]): GroupNode {
	return new GroupNode(init).add(...children);
}
