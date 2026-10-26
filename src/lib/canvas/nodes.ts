import {
	layoutWithLines,
	prepareWithSegments,
	type PreparedTextWithSegments
} from '@chenglou/pretext';
import {
	applyShadow,
	clearShadow,
	getPaintVersion,
	resolvePaint,
	snapTextPoint,
	type Paint,
	type Shadow
} from './paint.js';
import {
	expandBounds,
	roundedRectPath,
	transformBounds,
	unionBounds,
	type Box
} from './geometry.js';
import {
	createSignal,
	discreteInterpolate,
	numberSignal,
	stringSignal,
	type Signal
} from './signal.js';

export interface ClipBox {
	/** Center offset from the node origin. */
	x?: number;
	y?: number;
	width: number;
	height: number;
	radius?: number;
	smoothness?: number;
}

export type ClipRegion = boolean | ClipBox;

export interface NodeInit {
	id?: string;
	layoutKey?: string;
	x?: number;
	y?: number;
	rotation?: number;
	scale?: number;
	opacity?: number;
	visible?: boolean;
	shadow?: Shadow | null;
	/**
	 * Caches this node and its children in an offscreen bitmap. Use it for
	 * subtrees that move or scale without changing their contents.
	 */
	cache?: boolean;
	/** Extra space around a cached subtree, to keep shadows from clipping. */
	cachePadding?: number;
	/**
	 * Clips the node's children to its own shape, or to an explicit rounded
	 * box for groups and other nodes without a path of their own.
	 */
	clip?: ClipRegion;
}

export interface DrawOptions {
	/** True while the scene clock is running live, which lets video play natively. */
	playing?: boolean;
}

export interface NodeValues {
	x?: number;
	y?: number;
	rotation?: number;
	scale?: number;
	opacity?: number;
	visible?: boolean;
	shadow?: Shadow | null;
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
	readonly shadow: Signal<Shadow | null>;
	readonly layoutX: Signal<number>;
	readonly layoutY: Signal<number>;
	readonly layoutScaleX: Signal<number>;
	readonly layoutScaleY: Signal<number>;
	readonly layoutAlpha: Signal<number>;
	readonly cache: boolean;
	readonly cachePadding: number;
	readonly clip: ClipRegion;
	/** Video subtrees opt out because every frame has different pixels. */
	get cacheable(): boolean {
		return true;
	}
	/** Set by the scene instance so async nodes can ask for a redraw. */
	onInvalidate: (() => void) | null = null;
	parent: Node | null = null;
	#children: Node[] = [];
	#cachedSubtree: {
		key: string;
		canvas: HTMLCanvasElement;
		scale: number;
		offsetX: number;
		offsetY: number;
	} | null = null;

	constructor(init: NodeInit = {}) {
		this.id = init.id ?? `node-${nextNodeId++}`;
		this.layoutKey = init.layoutKey;
		this.x = numberSignal(init.x ?? 0, `${this.id}.x`);
		this.y = numberSignal(init.y ?? 0, `${this.id}.y`);
		this.rotation = numberSignal(init.rotation ?? 0, `${this.id}.rotation`);
		this.scale = numberSignal(init.scale ?? 1, `${this.id}.scale`);
		this.opacity = numberSignal(init.opacity ?? 1, `${this.id}.opacity`);
		this.visible = createSignal(init.visible ?? true, discreteInterpolate, `${this.id}.visible`);
		this.shadow = createSignal(init.shadow ?? null, discreteInterpolate, `${this.id}.shadow`);
		this.layoutX = numberSignal(0, `${this.id}.layoutX`);
		this.layoutY = numberSignal(0, `${this.id}.layoutY`);
		this.layoutScaleX = numberSignal(1, `${this.id}.layoutScaleX`);
		this.layoutScaleY = numberSignal(1, `${this.id}.layoutScaleY`);
		this.layoutAlpha = numberSignal(1, `${this.id}.layoutAlpha`);
		this.cache = init.cache ?? false;
		this.cachePadding = init.cachePadding ?? 48;
		this.clip = init.clip ?? false;
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
			shadow: this.shadow(),
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
		if (state.shadow === null || typeof state.shadow === 'object') {
			this.shadow(state.shadow as Shadow | null);
		}
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
		if (values.shadow !== undefined) this.shadow(values.shadow);
		return this;
	}

	/** Asks the owning scene to redraw after an async change such as an image load. */
	requestDraw() {
		this.#root().onInvalidate?.();
	}

	#root(): Node {
		return this.parent ? this.parent.#root() : this;
	}

	abstract measure(ctx: CanvasRenderingContext2D): Size;

	abstract drawSelf(ctx: CanvasRenderingContext2D, time?: number, options?: DrawOptions): void;

	/** Extra drawing state that a cache signature must notice. */
	protected drawState(): Record<string, unknown> {
		return {};
	}

	/** The node's own painted box in local coordinates. */
	selfBounds(ctx: CanvasRenderingContext2D): Box {
		const size = this.measure(ctx);
		let bounds: Box = {
			x: -size.width / 2,
			y: -size.height / 2,
			width: size.width,
			height: size.height
		};
		const shadow = this.shadow();
		if (shadow) {
			const blur = (shadow.blur ?? 24) * 2;
			const offset = Math.max(Math.abs(shadow.offsetX ?? 0), Math.abs(shadow.offsetY ?? 0));
			bounds = expandBounds(bounds, blur + offset);
		}
		if (this.clip) {
			const clip =
				typeof this.clip === 'object'
					? {
							x: (this.clip.x ?? 0) - this.clip.width / 2,
							y: (this.clip.y ?? 0) - this.clip.height / 2,
							width: this.clip.width,
							height: this.clip.height
						}
					: this.clipBounds(ctx);
			if (clip) bounds = unionBounds(bounds, clip);
		}
		return bounds;
	}

	/** The painted box of this node and every visible child in local coordinates. */
	contentBounds(ctx: CanvasRenderingContext2D): Box {
		let bounds = this.selfBounds(ctx);
		for (const child of this.#children) {
			const alpha = child.opacity() * child.layoutAlpha();
			if (!child.visible() || alpha <= 0) continue;
			const childBounds = transformBounds(
				child.contentBounds(ctx),
				child.x() + child.layoutX(),
				child.y() + child.layoutY(),
				child.rotation(),
				child.scale() * child.layoutScaleX(),
				child.scale() * child.layoutScaleY()
			);
			bounds = unionBounds(bounds, childBounds);
		}
		return bounds;
	}

	/** The shape used by `clip`, in local coordinates. */
	protected clipBounds(ctx: CanvasRenderingContext2D): Box | null {
		const size = this.measure(ctx);
		return {
			x: -size.width / 2,
			y: -size.height / 2,
			width: size.width,
			height: size.height
		};
	}

	protected applyClip(ctx: CanvasRenderingContext2D) {
		if (typeof this.clip === 'object') {
			const clip = this.clip;
			roundedRectPath(
				ctx,
				clip.width,
				clip.height,
				clip.radius ?? 0,
				clip.smoothness ?? 0,
				clip.x ?? 0,
				clip.y ?? 0
			);
			ctx.clip();
			return;
		}

		const bounds = this.clipBounds(ctx) ?? this.selfBounds(ctx);
		ctx.beginPath();
		ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
		ctx.clip();
	}

	draw(ctx: CanvasRenderingContext2D, time = 0, options: DrawOptions = {}) {
		const alpha = this.opacity() * this.layoutAlpha();
		if (!this.visible() || alpha <= 0) return;

		ctx.save();
		ctx.translate(this.x() + this.layoutX(), this.y() + this.layoutY());
		ctx.rotate((this.rotation() * Math.PI) / 180);
		ctx.scale(this.scale() * this.layoutScaleX(), this.scale() * this.layoutScaleY());
		ctx.globalAlpha *= alpha;

		if (this.cache && this.cacheable && cacheDepth === 0) {
			this.#drawSubtreeCached(ctx, time, options);
		} else {
			this.#drawContent(ctx, time, options);
		}

		ctx.restore();
	}

	drawGhost(
		ctx: CanvasRenderingContext2D,
		centerX: number,
		centerY: number,
		alpha: number,
		time = 0
	) {
		if (alpha <= 0) return;

		ctx.save();
		ctx.translate(centerX, centerY);
		ctx.rotate((this.rotation() * Math.PI) / 180);
		ctx.scale(this.scale() * this.layoutScaleX(), this.scale() * this.layoutScaleY());
		ctx.globalAlpha *= alpha;
		this.#drawContent(ctx, time, { playing: false });
		ctx.restore();
	}

	#drawContent(ctx: CanvasRenderingContext2D, time: number, options: DrawOptions) {
		applyShadow(ctx, this.shadow());
		this.drawSelf(ctx, time, options);
		clearShadow(ctx);

		if (this.clip) {
			ctx.save();
			this.applyClip(ctx);
			for (const child of this.#children) child.draw(ctx, time, options);
			ctx.restore();
			return;
		}

		for (const child of this.#children) child.draw(ctx, time, options);
	}

	#drawSubtreeCached(ctx: CanvasRenderingContext2D, time: number, options: DrawOptions) {
		if (typeof document === 'undefined') {
			this.#drawContent(ctx, time, options);
			return;
		}

		const signature = this.#cacheSignature();
		if (signature === null) {
			this.#drawContent(ctx, time, options);
			return;
		}

		const matrix = ctx.getTransform();
		const scaleX = Math.hypot(matrix.a, matrix.b);
		const scaleY = Math.hypot(matrix.c, matrix.d);
		const worldScale = Math.max(scaleX, scaleY);
		const scale = Math.max(0.5, Math.min(4, Math.round(worldScale * 4) / 4));
		const key = `${scale}|${signature}`;

		if (!this.#cachedSubtree || this.#cachedSubtree.key !== key) {
			const bounds = expandBounds(this.contentBounds(ctx), this.cachePadding);
			const width = Math.ceil(bounds.width * scale);
			const height = Math.ceil(bounds.height * scale);
			if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
				this.#cachedSubtree = null;
				this.#drawContent(ctx, time, options);
				return;
			}

			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, width);
			canvas.height = Math.max(1, height);
			const cache = canvas.getContext('2d');
			if (!cache) {
				this.#drawContent(ctx, time, options);
				return;
			}

			const offsetX = -bounds.x * scale;
			const offsetY = -bounds.y * scale;
			cache.setTransform(scale, 0, 0, scale, offsetX, offsetY);
			cacheDepth += 1;
			try {
				this.#drawContent(cache, time, options);
			} finally {
				cacheDepth -= 1;
			}
			this.#cachedSubtree = { key, canvas, scale, offsetX, offsetY };
		}

		const cached = this.#cachedSubtree;
		if (!cached) {
			this.#drawContent(ctx, time, options);
			return;
		}
		ctx.drawImage(
			cached.canvas,
			-cached.offsetX / cached.scale,
			-cached.offsetY / cached.scale,
			cached.canvas.width / cached.scale,
			cached.canvas.height / cached.scale
		);
	}

	#cacheSignature(): string | null {
		if (!this.cacheable) return null;
		const state = { ...this.saveState(), ...this.drawState() } as Record<string, unknown>;
		delete state.x;
		delete state.y;
		delete state.rotation;
		delete state.scale;
		delete state.opacity;
		delete state.layoutX;
		delete state.layoutY;
		delete state.layoutScaleX;
		delete state.layoutScaleY;
		delete state.layoutAlpha;

		const children: string[] = [];
		for (const child of this.#children) {
			const signature = child.#cacheSignature();
			if (signature === null) return null;
			children.push(signature);
		}

		return safeStringify({
			state,
			clip: this.clip,
			paint: getPaintVersion(),
			children
		});
	}
}

let cacheDepth = 0;

function safeStringify(value: unknown): string {
	return JSON.stringify(value, (_key, item: unknown) => {
		if (typeof item === 'function') return '[function]';
		if (typeof HTMLElement !== 'undefined' && item instanceof HTMLElement) {
			return `[element:${item.tagName}]`;
		}
		return item;
	});
}

export interface TextInit extends NodeInit {
	text: string;
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: number;
	fill?: Paint;
	align?: CanvasTextAlign;
	/** Maximum line width before the text wraps. */
	maxWidth?: number | null;
	/** Line height as a multiple of the font size. */
	lineHeight?: number;
}

/** Wraps text to `maxWidth` using the context's current font. */
export function wrapText(
	ctx: CanvasRenderingContext2D,
	text: string,
	maxWidth: number | null
): string[] {
	const paragraphs = text.split('\n');
	if (maxWidth === null || maxWidth <= 0) return paragraphs;

	const lines: string[] = [];
	for (const paragraph of paragraphs) {
		if (paragraph.length === 0) {
			lines.push('');
			continue;
		}

		let current = '';
		for (const word of paragraph.split(' ')) {
			const candidate = current.length > 0 ? `${current} ${word}` : word;
			if (ctx.measureText(candidate).width <= maxWidth) {
				current = candidate;
				continue;
			}

			if (current.length > 0) {
				lines.push(current);
				current = '';
			}

			if (ctx.measureText(word).width <= maxWidth) {
				current = word;
				continue;
			}

			// a word wider than the box still has to break somewhere
			for (const char of word) {
				if (current.length > 0 && ctx.measureText(current + char).width > maxWidth) {
					lines.push(current);
					current = char;
				} else {
					current += char;
				}
			}
		}
		lines.push(current);
	}

	return lines;
}

export class TextNode extends Node {
	override readonly kind = 'text';
	readonly text: Signal<string>;
	readonly fontSize: Signal<number>;
	readonly fontFamily: Signal<string>;
	readonly fontWeight: Signal<number>;
	readonly fill: Signal<Paint>;
	readonly align: Signal<CanvasTextAlign>;
	readonly maxWidth: Signal<number | null>;
	readonly lineHeight: Signal<number>;
	#cached: {
		key: string;
		canvas: HTMLCanvasElement;
		scale: number;
		offsetX: number;
		offsetY: number;
	} | null = null;
	#prepared: { key: string; value: PreparedTextWithSegments } | null = null;

	constructor(init: TextInit) {
		super(init);
		this.text = stringSignal(init.text, `${this.id}.text`);
		this.fontSize = numberSignal(init.fontSize ?? 32, `${this.id}.fontSize`);
		this.fontFamily = stringSignal(
			init.fontFamily ?? 'Atkinson Hyperlegible, system-ui, sans-serif',
			`${this.id}.fontFamily`
		);
		this.fontWeight = numberSignal(init.fontWeight ?? 400, `${this.id}.fontWeight`);
		this.fill = createSignal<Paint>(init.fill ?? '#fafafa', discreteInterpolate, `${this.id}.fill`);
		this.align = createSignal(init.align ?? 'center', discreteInterpolate, `${this.id}.align`);
		this.maxWidth = createSignal<number | null>(
			init.maxWidth ?? null,
			discreteInterpolate,
			`${this.id}.maxWidth`
		);
		this.lineHeight = numberSignal(init.lineHeight ?? 1.25, `${this.id}.lineHeight`);
	}

	override saveState(): NodeState {
		return {
			...super.saveState(),
			text: this.text(),
			fontSize: this.fontSize(),
			fontFamily: this.fontFamily(),
			fontWeight: this.fontWeight(),
			fill: this.fill(),
			align: this.align(),
			maxWidth: this.maxWidth(),
			lineHeight: this.lineHeight()
		};
	}

	override restoreState(state: NodeState) {
		super.restoreState(state);
		if (typeof state.text === 'string') this.text(state.text);
		if (typeof state.fontSize === 'number') this.fontSize(state.fontSize);
		if (typeof state.fontFamily === 'string') this.fontFamily(state.fontFamily);
		if (typeof state.fontWeight === 'number') this.fontWeight(state.fontWeight);
		if (typeof state.fill === 'string' || typeof state.fill === 'object') {
			if (state.fill !== null) this.fill(state.fill as Paint);
		}
		if (typeof state.align === 'string') this.align(state.align as CanvasTextAlign);
		if (state.maxWidth === null || typeof state.maxWidth === 'number') {
			this.maxWidth(state.maxWidth);
		}
		if (typeof state.lineHeight === 'number') this.lineHeight(state.lineHeight);
	}

	get font(): string {
		return `${this.fontWeight()} ${this.fontSize()}px ${this.fontFamily()}`;
	}

	#layout(ctx: CanvasRenderingContext2D): {
		lines: string[];
		width: number;
		height: number;
		lineHeight: number;
	} {
		const lineHeight = this.fontSize() * this.lineHeight();
		const maxWidth = this.maxWidth();
		const text = this.text();

		if (maxWidth === null || maxWidth <= 0) {
			ctx.save();
			ctx.font = this.font;
			const lines = text.split('\n');
			const width = lines.reduce(
				(widest, line) => Math.max(widest, ctx.measureText(line).width),
				0
			);
			ctx.restore();
			return { lines, width, height: Math.max(1, lines.length) * lineHeight, lineHeight };
		}

		const key = `${this.font}|${text}`;
		if (!this.#prepared || this.#prepared.key !== key) {
			this.#prepared = {
				key,
				value: prepareWithSegments(text, this.font, { whiteSpace: 'pre-wrap' })
			};
		}
		const result = layoutWithLines(this.#prepared.value, maxWidth, lineHeight);
		const lines = result.lines.map((line) => line.text);
		if (lines.length === 0) lines.push('');
		const width = result.lines.reduce((widest, line) => Math.max(widest, line.width), 0);
		return {
			lines,
			width: Math.min(maxWidth, width),
			height: Math.max(1, result.lineCount) * lineHeight,
			lineHeight
		};
	}

	/** The text broken into the lines the node actually draws. */
	lines(ctx: CanvasRenderingContext2D): string[] {
		return this.#layout(ctx).lines;
	}

	measure(ctx: CanvasRenderingContext2D): Size {
		const layout = this.#layout(ctx);
		return { width: layout.width, height: layout.height };
	}

	drawSelf(ctx: CanvasRenderingContext2D) {
		ctx.save();
		ctx.font = this.font;
		ctx.textAlign = this.align();
		ctx.textBaseline = 'middle';

		const layout = this.#layout(ctx);
		const top = -layout.height / 2;
		this.#drawCached(ctx, layout.lines, layout.width, layout.height, layout.lineHeight, top);
		ctx.restore();
	}

	#drawLines(
		ctx: CanvasRenderingContext2D,
		lines: string[],
		boxWidth: number,
		height: number,
		lineHeight: number,
		top: number,
		snap = true
	) {
		const x = this.align() === 'left' ? -boxWidth / 2 : this.align() === 'right' ? boxWidth / 2 : 0;
		ctx.fillStyle = resolvePaint(ctx, this.fill(), boxWidth, height, -boxWidth / 2, top, () =>
			this.requestDraw()
		);
		for (let index = 0; index < lines.length; index++) {
			const point = snap
				? snapTextPoint(ctx, x, top + (index + 0.5) * lineHeight)
				: { x, y: top + (index + 0.5) * lineHeight };
			ctx.fillText(lines[index]!, point.x, point.y);
		}
	}

	/**
	 * Draws a text node from a bitmap rendered once at its resting size. Scaling
	 * the bitmap keeps the glyph shape stable, which avoids Chromium's per frame
	 * text snapping.
	 */
	#drawCached(
		ctx: CanvasRenderingContext2D,
		lines: string[],
		boxWidth: number,
		height: number,
		lineHeight: number,
		top: number
	) {
		const matrix = ctx.getTransform();
		let parentScaleX = 1;
		let parentScaleY = 1;
		let parent = this.parent;
		while (parent) {
			parentScaleX *= parent.scale() * parent.layoutScaleX();
			parentScaleY *= parent.scale() * parent.layoutScaleY();
			parent = parent.parent;
		}
		const ownScaleX = Math.abs(this.scale() * this.layoutScaleX()) || 1;
		const ownScaleY = Math.abs(this.scale() * this.layoutScaleY()) || 1;
		const baseScaleX = Math.hypot(matrix.a, matrix.b) / Math.abs(parentScaleX * ownScaleX);
		const baseScaleY = Math.hypot(matrix.c, matrix.d) / Math.abs(parentScaleY * ownScaleY);
		const scale = Math.max(0.1, Math.max(baseScaleX, baseScaleY));
		const roundedScale = Math.round(scale * 1000) / 1000;
		const padding = 8;
		const key = [
			this.text(),
			this.font,
			safeStringify(this.fill()),
			getPaintVersion(),
			this.align(),
			this.maxWidth(),
			this.lineHeight(),
			roundedScale
		].join('|');

		if (!this.#cached || this.#cached.key !== key) {
			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.ceil((boxWidth + padding * 2) * roundedScale));
			canvas.height = Math.max(1, Math.ceil((height + padding * 2) * roundedScale));
			const cache = canvas.getContext('2d');
			if (!cache) return;
			const anchorX =
				this.align() === 'left' ? -boxWidth / 2 : this.align() === 'right' ? boxWidth / 2 : 0;
			const anchorY = top + lineHeight / 2;
			// put the text anchor on a cache pixel so the bitmap stays crisp at rest
			const originX =
				Math.round((boxWidth / 2 + padding + anchorX) * roundedScale) - anchorX * roundedScale;
			const originY =
				Math.round((height / 2 + padding + anchorY) * roundedScale) - anchorY * roundedScale;
			cache.setTransform(roundedScale, 0, 0, roundedScale, originX, originY);
			cache.font = this.font;
			cache.textAlign = this.align();
			cache.textBaseline = 'middle';
			this.#drawLines(cache, lines, boxWidth, height, lineHeight, top, false);
			this.#cached = {
				key,
				canvas,
				scale: roundedScale,
				offsetX: originX,
				offsetY: originY
			};
		}

		// draw the bitmap at the inverse of its cache transform so every line lands
		// exactly where direct text would put it
		const drawWidth = this.#cached.canvas.width / this.#cached.scale;
		const drawHeight = this.#cached.canvas.height / this.#cached.scale;
		const x = -this.#cached.offsetX / this.#cached.scale;
		const y = -this.#cached.offsetY / this.#cached.scale;
		ctx.drawImage(this.#cached.canvas, x, y, drawWidth, drawHeight);
	}
}

export interface RectInit extends NodeInit {
	width: number;
	height: number;
	radius?: number;
	/** 0 keeps circular corners, positive values use cubic corners. */
	smoothness?: number;
	fill?: Paint | null;
	stroke?: Paint | null;
	strokeWidth?: number;
}

export class RectNode extends Node {
	override readonly kind = 'rect';
	readonly width: Signal<number>;
	readonly height: Signal<number>;
	readonly radius: Signal<number>;
	readonly smoothness: Signal<number>;
	readonly fill: Signal<Paint | null>;
	readonly stroke: Signal<Paint | null>;
	readonly strokeWidth: Signal<number>;

	constructor(init: RectInit) {
		super(init);
		this.width = numberSignal(init.width, `${this.id}.width`);
		this.height = numberSignal(init.height, `${this.id}.height`);
		this.radius = numberSignal(init.radius ?? 0, `${this.id}.radius`);
		this.smoothness = numberSignal(init.smoothness ?? 0, `${this.id}.smoothness`);
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
			smoothness: this.smoothness(),
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
		if (typeof state.smoothness === 'number') this.smoothness(state.smoothness);
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
	}

	protected override clipBounds(): Box {
		const width = this.width();
		const height = this.height();
		return { x: -width / 2, y: -height / 2, width, height };
	}

	protected override applyClip(ctx: CanvasRenderingContext2D) {
		roundedRectPath(ctx, this.width(), this.height(), this.radius(), this.smoothness());
		ctx.clip();
	}

	drawSelf(ctx: CanvasRenderingContext2D) {
		const width = this.width();
		const height = this.height();
		const left = -width / 2;
		const top = -height / 2;

		roundedRectPath(ctx, width, height, this.radius(), this.smoothness());

		const fill = this.fill();
		if (fill) {
			ctx.fillStyle = resolvePaint(ctx, fill, width, height, left, top, () => this.requestDraw());
			ctx.fill();
		}

		const stroke = this.stroke();
		if (stroke && this.strokeWidth() > 0) {
			ctx.strokeStyle = resolvePaint(ctx, stroke, width, height, left, top, () =>
				this.requestDraw()
			);
			ctx.lineWidth = this.strokeWidth();
			ctx.stroke();
		}
	}
}

export class GroupNode extends Node {
	override readonly kind = 'group';

	override selfBounds(): Box {
		return { x: 0, y: 0, width: 0, height: 0 };
	}

	protected override clipBounds(ctx: CanvasRenderingContext2D): Box {
		return this.contentBounds(ctx);
	}

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
