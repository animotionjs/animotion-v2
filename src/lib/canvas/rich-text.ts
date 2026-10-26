import {
	materializeRichInlineLineRange,
	prepareRichInline,
	walkRichInlineLineRanges,
	type PreparedRichInline
} from '@chenglou/pretext/rich-inline';
import { resolvePaint, snapTextPoint, type Paint } from './paint.js';
import { Node, type NodeInit, type NodeState, type Size } from './nodes.js';
import {
	createSignal,
	discreteInterpolate,
	numberSignal,
	stringSignal,
	type Signal
} from './signal.js';

export interface RichTextRun {
	text: string;
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: number;
	fill?: Paint;
}

export interface RichTextInit extends NodeInit {
	runs: RichTextRun[];
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: number;
	fill?: Paint;
	align?: CanvasTextAlign;
	maxWidth?: number | null;
	lineHeight?: number;
}

export interface RichTextFragment {
	text: string;
	font: string;
	fill: Paint;
	width: number;
	gapBefore: number;
}

export interface RichTextLine {
	width: number;
	fragments: RichTextFragment[];
}

interface RichLayout {
	lines: RichTextLine[];
	width: number;
	height: number;
	lineHeight: number;
}

export class RichTextNode extends Node {
	override readonly kind = 'rich-text';
	readonly runs: Signal<RichTextRun[]>;
	readonly fontSize: Signal<number>;
	readonly fontFamily: Signal<string>;
	readonly fontWeight: Signal<number>;
	readonly fill: Signal<Paint>;
	readonly align: Signal<CanvasTextAlign>;
	readonly maxWidth: Signal<number | null>;
	readonly lineHeight: Signal<number>;
	#prepared: { key: string; value: PreparedRichInline } | null = null;
	#layout: { key: string; value: RichLayout } | null = null;

	constructor(init: RichTextInit) {
		super(init);
		this.runs = createSignal(init.runs, discreteInterpolate, `${this.id}.runs`);
		this.fontSize = numberSignal(init.fontSize ?? 32, `${this.id}.fontSize`);
		this.fontFamily = stringSignal(
			init.fontFamily ?? 'Atkinson Hyperlegible, system-ui, sans-serif',
			`${this.id}.fontFamily`
		);
		this.fontWeight = numberSignal(init.fontWeight ?? 400, `${this.id}.fontWeight`);
		this.fill = createSignal<Paint>(init.fill ?? '#fafafa', discreteInterpolate, `${this.id}.fill`);
		this.align = createSignal(init.align ?? 'left', discreteInterpolate, `${this.id}.align`);
		this.maxWidth = createSignal<number | null>(
			init.maxWidth ?? null,
			discreteInterpolate,
			`${this.id}.maxWidth`
		);
		this.lineHeight = numberSignal(init.lineHeight ?? 1.35, `${this.id}.lineHeight`);
	}

	#font(run: RichTextRun): string {
		const weight = run.fontWeight ?? this.fontWeight();
		const size = run.fontSize ?? this.fontSize();
		const family = run.fontFamily ?? this.fontFamily();
		return `${weight} ${size}px ${family}`;
	}

	#fillFor(run: RichTextRun): Paint {
		return run.fill ?? this.fill();
	}

	#key(): string {
		return [
			JSON.stringify(this.runs()),
			JSON.stringify(this.fill()),
			this.fontSize(),
			this.fontFamily(),
			this.fontWeight(),
			this.maxWidth(),
			this.lineHeight()
		].join('|');
	}

	#unwrap(ctx: CanvasRenderingContext2D): RichLayout {
		const lineHeight = this.fontSize() * this.lineHeight();
		const lines: RichTextLine[] = [{ width: 0, fragments: [] }];

		for (const run of this.runs()) {
			if (run.text.length === 0) continue;
			const font = this.#font(run);
			const fill = this.#fillFor(run);
			const parts = run.text.split('\n');
			for (let index = 0; index < parts.length; index++) {
				const part = parts[index]!;
				if (part.length > 0) {
					ctx.save();
					ctx.font = font;
					const width = ctx.measureText(part).width;
					ctx.restore();
					const line = lines.at(-1)!;
					line.fragments.push({ text: part, font, fill, width, gapBefore: 0 });
					line.width += width;
				}
				if (index < parts.length - 1) lines.push({ width: 0, fragments: [] });
			}
		}

		const width = lines.reduce((widest, line) => Math.max(widest, line.width), 0);
		return { lines, width, height: Math.max(1, lines.length) * lineHeight, lineHeight };
	}

	#wrap(): RichLayout {
		const runs = this.runs();
		const lineHeight = this.fontSize() * this.lineHeight();
		const maxWidth = this.maxWidth();
		const items = runs.map((run) => ({ text: run.text, font: this.#font(run) }));
		if (items.length === 0) items.push({ text: '', font: this.#font({ text: '' }) });

		const key = this.#key();
		if (!this.#prepared || this.#prepared.key !== key) {
			this.#prepared = {
				key,
				value: prepareRichInline(items, { whiteSpace: 'pre-wrap' })
			};
		}

		const lines: RichTextLine[] = [];
		const prepared = this.#prepared.value;
		walkRichInlineLineRanges(prepared, maxWidth ?? 0, (range) => {
			const line = materializeRichInlineLineRange(prepared, range);
			const fragments: RichTextFragment[] = [];
			for (const fragment of line.fragments) {
				const run = runs[fragment.itemIndex] ?? { text: '' };
				fragments.push({
					text: fragment.text,
					font: this.#font(run),
					fill: this.#fillFor(run),
					width: fragment.occupiedWidth,
					gapBefore: fragment.gapBefore
				});
			}
			lines.push({ width: line.width, fragments });
		});

		if (lines.length === 0) lines.push({ width: 0, fragments: [] });
		const width = lines.reduce((widest, line) => Math.max(widest, line.width), 0);
		return {
			lines,
			width: Math.max(0, width),
			height: Math.max(1, lines.length) * lineHeight,
			lineHeight
		};
	}

	#result(ctx: CanvasRenderingContext2D): RichLayout {
		const key = this.#key();
		if (this.#layout?.key === key) return this.#layout.value;
		const maxWidth = this.maxWidth();
		const value = maxWidth === null || maxWidth <= 0 ? this.#unwrap(ctx) : this.#wrap();
		this.#layout = { key, value };
		return value;
	}

	lines(ctx: CanvasRenderingContext2D): RichTextLine[] {
		return this.#result(ctx).lines;
	}

	measure(ctx: CanvasRenderingContext2D): Size {
		const layout = this.#result(ctx);
		const maxWidth = this.maxWidth();
		return {
			width: maxWidth === null ? layout.width : Math.min(maxWidth, layout.width),
			height: layout.height
		};
	}

	drawSelf(ctx: CanvasRenderingContext2D) {
		const layout = this.#result(ctx);
		const maxWidth = this.maxWidth();
		const blockWidth = maxWidth === null ? layout.width : Math.min(maxWidth, layout.width);
		const top = -layout.height / 2;

		ctx.save();
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';

		for (let index = 0; index < layout.lines.length; index++) {
			const line = layout.lines[index]!;
			const y = top + (index + 0.5) * layout.lineHeight;
			let x: number;
			if (this.align() === 'left') x = -blockWidth / 2;
			else if (this.align() === 'right') x = blockWidth / 2 - line.width;
			else x = -line.width / 2;

			// snap the line start once so styled runs keep their measured spacing
			const start = snapTextPoint(ctx, x, y);
			let drawX = start.x;
			for (const fragment of line.fragments) {
				drawX += fragment.gapBefore;
				if (fragment.text.length > 0) {
					ctx.font = fragment.font;
					ctx.fillStyle = resolvePaint(
						ctx,
						fragment.fill,
						Math.max(1, blockWidth),
						layout.height,
						-blockWidth / 2,
						top,
						() => this.requestDraw()
					);
					ctx.fillText(fragment.text, drawX, start.y);
				}
				drawX += fragment.width;
			}
		}

		ctx.restore();
	}

	override saveState(): NodeState {
		return {
			...super.saveState(),
			runs: this.runs(),
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
		if (Array.isArray(state.runs)) this.runs(state.runs as RichTextRun[]);
		if (typeof state.fontSize === 'number') this.fontSize(state.fontSize);
		if (typeof state.fontFamily === 'string') this.fontFamily(state.fontFamily);
		if (typeof state.fontWeight === 'number') this.fontWeight(state.fontWeight);
		if (typeof state.fill === 'string' || (typeof state.fill === 'object' && state.fill !== null)) {
			this.fill(state.fill as Paint);
		}
		if (typeof state.align === 'string') this.align(state.align as CanvasTextAlign);
		if (state.maxWidth === null || typeof state.maxWidth === 'number') {
			this.maxWidth(state.maxWidth);
		}
		if (typeof state.lineHeight === 'number') this.lineHeight(state.lineHeight);
	}
}
