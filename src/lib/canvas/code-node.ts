import {
	diffStrings,
	getTheme,
	getThemeVersion,
	highlight,
	type MorphToken
} from '../code/highlighter.js';
import { themes } from '../code/themes.js';
import { snapTextPoint } from './paint.js';
import { clamp, easeInOut, lerp, type Easing } from './easing.js';
import { Node, type NodeInit, type NodeState, type Size } from './nodes.js';
import {
	createSignal,
	discreteInterpolate,
	numberSignal,
	stringSignal,
	type Signal
} from './signal.js';
import { Animation, type Step } from './steps.js';

/** A zero indexed point in a code block. */
export interface CodePosition {
	line: number;
	col: number;
}

/** A selection or edit range. The end point is exclusive. */
export interface CodeRange {
	start: CodePosition;
	end: CodePosition;
}

export interface CodeNodeInit extends NodeInit {
	code: string;
	language?: string;
	fontSize?: number;
	lineHeight?: number;
	fontFamily?: string;
	lineNumbers?: boolean;
	fill?: string;
	/** Replace tabs with this many spaces before measuring and drawing. */
	tabSize?: number;
	/** Clip the block to this many lines and allow scrolling. */
	maxLines?: number;
	/** Reserve at least this many lines so edits do not recenter the block. */
	minLines?: number;
	/** Reserve at least this many columns so edits do not recenter the block. */
	minCols?: number;
	selectionFill?: string;
	/** Caret color. */
	cursorFill?: string;
	/** Caret blink period in seconds, or zero to keep it steady. */
	cursorBlink?: number;
	/** Color of the scroll fade masks, or zero size to hide them. */
	scrollFadeColor?: string;
	scrollFadeSize?: number;
}

interface CodeLayout {
	width: number;
	height: number;
	lines: number;
	cols: number;
	visibleLines: number;
}

function expandTabs(code: string, tabSize: number): string {
	if (!code.includes('\t')) return code;
	return code
		.split('\n')
		.map((line) => line.replace(/\t/g, ' '.repeat(tabSize)))
		.join('\n');
}

function offsetAt(code: string, position: CodePosition): number {
	const lines = code.split('\n');
	const line = Math.min(Math.max(0, position.line), lines.length - 1);
	let offset = 0;
	for (let index = 0; index < line; index++) offset += lines[index]!.length + 1;
	return offset + Math.min(Math.max(0, position.col), lines[line]?.length ?? 0);
}

/** A position in a code block, for insert and selection helpers. */
export function position(line: number, col: number): CodePosition {
	return { line, col };
}

/** A range in a code block, with an exclusive end. */
export function range(start: CodePosition, end: CodePosition): CodeRange {
	return { start, end };
}

function fallbackMorph(from: string, to: string): MorphToken[] {
	const before = from.split('\n');
	const after = to.split('\n');
	const tokens: MorphToken[] = [];
	for (let line = 0; line < Math.max(before.length, after.length); line++) {
		const previous = before[line];
		const next = after[line];
		if (previous === next && previous !== undefined) {
			tokens.push({
				code: previous,
				color: '',
				morph: 'retain',
				from: [0, line],
				to: [0, line]
			});
		} else {
			if (previous !== undefined) {
				tokens.push({
					code: previous,
					color: '',
					morph: 'delete',
					from: [0, line],
					to: null
				});
			}
			if (next !== undefined) {
				tokens.push({
					code: next,
					color: '',
					morph: 'create',
					from: null,
					to: [0, line]
				});
			}
		}
	}
	return tokens;
}

export class CodeNode extends Node {
	override readonly kind = 'code';
	readonly code: Signal<string>;
	readonly language: Signal<string>;
	readonly fontSize: Signal<number>;
	readonly lineHeight: Signal<number>;
	readonly fontFamily: Signal<string>;
	readonly lineNumbers: Signal<boolean>;
	readonly fill: Signal<string>;
	readonly tabSize: Signal<number>;
	readonly maxLines: Signal<number | null>;
	readonly minLines: Signal<number>;
	readonly minCols: Signal<number>;
	readonly selectionFill: Signal<string>;
	readonly transition: Signal<number>;
	readonly selection: Signal<CodeRange | null>;
	readonly selectionAlpha: Signal<number>;
	readonly scroll: Signal<number>;
	readonly cursor: Signal<CodePosition | null>;
	readonly cursorAlpha: Signal<number>;
	readonly cursorFill: Signal<string>;
	readonly cursorBlink: number;
	readonly scrollFadeColor: Signal<string>;
	readonly scrollFadeSize: Signal<number>;
	previousCode: string | null = null;
	morphTokens: MorphToken[] = [];
	#morphTheme = -1;
	#tokenCache: { code: string; language: string; theme: number; tokens: MorphToken[] } | null =
		null;

	override get cacheable(): boolean {
		return this.cursor() === null;
	}

	constructor(init: CodeNodeInit) {
		super(init);
		this.code = stringSignal(init.code, `${this.id}.code`);
		this.language = stringSignal(init.language ?? 'typescript', `${this.id}.language`);
		this.fontSize = numberSignal(init.fontSize ?? 26, `${this.id}.fontSize`);
		this.lineHeight = numberSignal(init.lineHeight ?? 1.5, `${this.id}.lineHeight`);
		this.fontFamily = stringSignal(
			init.fontFamily ?? "'JetBrains Mono Variable', ui-monospace, monospace",
			`${this.id}.fontFamily`
		);
		this.lineNumbers = createSignal(
			init.lineNumbers ?? true,
			discreteInterpolate,
			`${this.id}.lineNumbers`
		);
		this.fill = stringSignal(init.fill ?? '#f0f0f0', `${this.id}.fill`);
		this.tabSize = numberSignal(init.tabSize ?? 2, `${this.id}.tabSize`);
		this.maxLines = createSignal(init.maxLines ?? null, discreteInterpolate, `${this.id}.maxLines`);
		this.minLines = numberSignal(init.minLines ?? 0, `${this.id}.minLines`);
		this.minCols = numberSignal(init.minCols ?? 0, `${this.id}.minCols`);
		this.selectionFill = stringSignal(
			init.selectionFill ?? 'rgba(255, 213, 79, 0.18)',
			`${this.id}.selectionFill`
		);
		this.transition = numberSignal(1, `${this.id}.transition`);
		this.selection = createSignal<CodeRange | null>(
			null,
			discreteInterpolate,
			`${this.id}.selection`
		);
		this.selectionAlpha = numberSignal(0, `${this.id}.selectionAlpha`);
		this.scroll = numberSignal(0, `${this.id}.scroll`);
		this.cursor = createSignal<CodePosition | null>(null, discreteInterpolate, `${this.id}.cursor`);
		this.cursorAlpha = numberSignal(0, `${this.id}.cursorAlpha`);
		this.cursorFill = stringSignal(init.cursorFill ?? '#fbbf24', `${this.id}.cursorFill`);
		this.cursorBlink = init.cursorBlink ?? 1.1;
		this.scrollFadeColor = stringSignal(
			init.scrollFadeColor ?? '#09090b',
			`${this.id}.scrollFadeColor`
		);
		this.scrollFadeSize = numberSignal(init.scrollFadeSize ?? 0, `${this.id}.scrollFadeSize`);
	}

	get font(): string {
		return `${this.fontSize()}px ${this.fontFamily()}`;
	}

	/** The code with tabs expanded, ready to measure and draw. */
	get source(): string {
		return expandTabs(this.code(), this.tabSize());
	}

	morphTo(code: string, duration = 0.6, ease: Easing = easeInOut): Animation {
		return new Animation(new CodeMorphStep(this, code, duration, ease));
	}

	/** Inserts text at a position and animates the token diff. */
	insertText(text: string, at: CodePosition, duration = 0.4, ease: Easing = easeInOut): Animation {
		const code = this.code();
		const offset = offsetAt(code, at);
		return this.morphTo(code.slice(0, offset) + text + code.slice(offset), duration, ease);
	}

	prepend(text: string, duration = 0.4, ease: Easing = easeInOut): Animation {
		return this.insertText(text, position(0, 0), duration, ease);
	}

	append(text: string, duration = 0.4, ease: Easing = easeInOut): Animation {
		const lines = this.code().split('\n');
		return this.insertText(
			text,
			position(lines.length - 1, lines.at(-1)?.length ?? 0),
			duration,
			ease
		);
	}

	/** Removes a range or the first occurrence of a string. */
	removeText(target: CodeRange | string, duration = 0.4, ease: Easing = easeInOut): Animation {
		const code = this.code();
		const span = typeof target === 'string' ? this.#find(code, target) : target;
		if (!span) return this.morphTo(code, duration, ease);
		const start = offsetAt(code, span.start);
		const end = offsetAt(code, span.end);
		return this.morphTo(code.slice(0, start) + code.slice(end), duration, ease);
	}

	/** Replaces a range or the first occurrence of a string. */
	replaceText(
		target: CodeRange | string,
		text: string,
		duration = 0.4,
		ease: Easing = easeInOut
	): Animation {
		const code = this.code();
		const span = typeof target === 'string' ? this.#find(code, target) : target;
		if (!span) return this.morphTo(code + text, duration, ease);
		const start = offsetAt(code, span.start);
		const end = offsetAt(code, span.end);
		return this.morphTo(code.slice(0, start) + text + code.slice(end), duration, ease);
	}

	/** Highlights a range, or fades the current selection away when null. */
	select(target: CodeRange | null, duration = 0.4, ease: Easing = easeInOut): Animation {
		return new Animation(new CodeSelectionStep(this, target, duration, ease));
	}

	/** Selects a range and scrolls it into view. */
	reveal(target: CodeRange, duration = 0.4, ease: Easing = easeInOut): Animation {
		return new Animation(new CodeRevealStep(this, target, duration, ease));
	}

	/** Scrolls so the line sits at the top of the visible block. */
	scrollTo(line: number, duration = 0.4, ease: Easing = easeInOut): Animation {
		return new Animation(new CodeScrollStep(this, line, duration, ease));
	}

	/** Shows the caret at a position, or fades it away when null. */
	placeCursor(at: CodePosition | null, duration = 0.2, ease: Easing = easeInOut): Animation {
		return new Animation(new CodeCursorStep(this, at, duration, ease));
	}

	/** Fades the caret away. */
	hideCursor(duration = 0.2, ease: Easing = easeInOut): Animation {
		return this.placeCursor(null, duration, ease);
	}

	#find(code: string, target: string): CodeRange | null {
		const index = code.indexOf(target);
		if (index === -1) return null;
		return this.#rangeAt(code, index, index + target.length);
	}

	#rangeAt(code: string, start: number, end: number): CodeRange {
		const startPoint = this.#pointAt(code, start);
		const endPoint = this.#pointAt(code, end);
		return { start: startPoint, end: endPoint };
	}

	#pointAt(code: string, offset: number): CodePosition {
		const before = code.slice(0, offset).split('\n');
		return { line: before.length - 1, col: before.at(-1)?.length ?? 0 };
	}

	#layout(ctx: CanvasRenderingContext2D, code: string): CodeLayout {
		const lines = code.split('\n');
		const reservedLines = Math.max(lines.length, this.minLines());
		const visibleLines = Math.max(1, Math.min(reservedLines, this.maxLines() ?? reservedLines));
		const cols = Math.max(
			this.minCols(),
			lines.reduce((longest, line) => Math.max(longest, line.length), 0)
		);
		const charWidth = ctx.measureText('M').width;
		const digits = String(reservedLines).length;
		const gutter = this.lineNumbers() ? (digits + 1) * charWidth : 0;
		const padding = this.#fadePadding();
		return {
			width: cols * charWidth + gutter,
			height: Math.max(1, visibleLines) * this.fontSize() * this.lineHeight() + padding * 2,
			lines: lines.length,
			cols,
			visibleLines
		};
	}

	#fadePadding(): number {
		if (this.maxLines() === null) return 0;
		return Math.max(0, this.scrollFadeSize());
	}

	measure(ctx: CanvasRenderingContext2D): Size {
		ctx.save();
		ctx.font = this.font;
		const layout = this.#layout(ctx, this.source);
		ctx.restore();
		return { width: layout.width, height: layout.height };
	}

	#tokens(code: string): MorphToken[] {
		const language = this.language();
		const theme = getThemeVersion();
		if (
			this.#tokenCache &&
			this.#tokenCache.code === code &&
			this.#tokenCache.language === language &&
			this.#tokenCache.theme === theme
		) {
			return this.#tokenCache.tokens;
		}

		const tokens = highlight(code, language);
		const result =
			tokens.length > 0
				? tokens.map((token) => ({
						code: token.code,
						color: token.color,
						morph: 'retain' as const,
						from: [token.col, token.line] as [number, number],
						to: [token.col, token.line] as [number, number]
					}))
				: code
						.split('\n')
						.filter((line) => line.length > 0)
						.map((line, index) => ({
							code: line,
							color: '',
							morph: 'retain' as const,
							from: [0, index] as [number, number],
							to: [0, index] as [number, number]
						}));
		this.#tokenCache = { code, language, theme, tokens: result };
		return result;
	}

	/** Rebuilds the token diff for the current transition. */
	prepareMorph() {
		this.#morphTheme = -1;
		this.#refreshMorph();
	}

	#refreshMorph() {
		const previous = this.previousCode;
		if (previous === null) return;
		const version = getThemeVersion();
		if (this.#morphTheme === version && this.morphTokens.length > 0) return;
		this.#morphTheme = version;
		const from = expandTabs(previous, this.tabSize());
		this.morphTokens = diffStrings(from, this.source, this.language());
		if (this.morphTokens.length === 0) {
			this.morphTokens = fallbackMorph(from, this.source);
		}
	}

	protected override drawState(): Record<string, unknown> {
		return {
			theme: getThemeVersion(),
			cursor: this.cursor(),
			cursorAlpha: this.cursorAlpha()
		};
	}

	drawSelf(ctx: CanvasRenderingContext2D, time = 0) {
		ctx.save();
		ctx.font = this.font;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';

		const target = this.source;
		const progress = clamp(this.transition(), 0, 1);
		const targetLayout = this.#layout(ctx, target);
		const previous = this.previousCode;
		const previousLayout = previous === null ? targetLayout : this.#layout(ctx, previous);
		const width = lerp(previousLayout.width, targetLayout.width, progress);
		const height = lerp(previousLayout.height, targetLayout.height, progress);
		const left = -width / 2;
		const padding = this.#fadePadding();
		const top = -height / 2 + padding;
		const charWidth = ctx.measureText('M').width;
		const lineHeight = this.fontSize() * this.lineHeight();
		const gutter = this.lineNumbers()
			? (String(Math.max(targetLayout.lines, previousLayout.lines)).length + 1) * charWidth
			: 0;
		const scroll = this.scroll();
		const clipHeight = Math.max(1, targetLayout.visibleLines) * lineHeight;
		const anchor = snapTextPoint(ctx, left, top);
		const drawLeft = anchor.x;
		const drawTop = anchor.y;

		ctx.save();
		ctx.beginPath();
		ctx.rect(drawLeft, drawTop, Math.max(1, width), clipHeight);
		ctx.clip();

		this.#drawLineNumbers(ctx, target, drawLeft, drawTop, charWidth, lineHeight, gutter, scroll, 1);

		this.#drawSelection(ctx, drawLeft, drawTop, charWidth, lineHeight, gutter, scroll);

		if (previous !== null && progress < 1) {
			this.#refreshMorph();
			this.#drawMorph(ctx, drawLeft, drawTop, charWidth, lineHeight, gutter, scroll, progress);
		} else {
			this.#drawTokens(ctx, target, drawLeft, drawTop, charWidth, lineHeight, gutter, scroll, 1);
		}

		this.#drawCursor(ctx, drawLeft, drawTop, width, charWidth, lineHeight, gutter, scroll, time);
		ctx.restore();

		this.#drawScrollFades(ctx, drawLeft, drawTop, width, clipHeight, targetLayout, scroll, padding);

		ctx.restore();
	}

	#drawCursor(
		ctx: CanvasRenderingContext2D,
		left: number,
		top: number,
		width: number,
		charWidth: number,
		lineHeight: number,
		gutter: number,
		scroll: number,
		time: number
	) {
		const cursor = this.cursor();
		const alpha = this.cursorAlpha();
		if (!cursor || alpha <= 0) return;

		let blink = 1;
		if (this.cursorBlink > 0) {
			blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos((time / this.cursorBlink) * Math.PI * 2));
		}

		const x = left + gutter + cursor.col * charWidth;
		const y = top + (cursor.line - scroll) * lineHeight + lineHeight * 0.08;
		if (
			x < left ||
			x > left + width ||
			y + lineHeight < top ||
			y > top + lineHeight * this.#maxLinesSafe()
		) {
			return;
		}

		ctx.save();
		ctx.globalAlpha *= alpha * blink;
		ctx.fillStyle = this.cursorFill();
		ctx.fillRect(x, y, Math.max(2, this.fontSize() * 0.07), lineHeight * 0.84);
		ctx.restore();
	}

	#drawScrollFades(
		ctx: CanvasRenderingContext2D,
		left: number,
		top: number,
		width: number,
		contentHeight: number,
		layout: CodeLayout,
		scroll: number,
		padding: number
	) {
		const maxLines = this.maxLines();
		if (padding <= 0 || maxLines === null) return;
		const maxScroll = Math.max(0, layout.lines - layout.visibleLines);
		if (maxScroll <= 0) return;
		const color = this.scrollFadeColor();

		if (scroll > 0.01) {
			const gradient = ctx.createLinearGradient(0, top - padding, 0, top);
			gradient.addColorStop(0, color);
			gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
			ctx.fillStyle = gradient;
			ctx.fillRect(left, top - padding, Math.max(1, width), padding);
		}

		if (scroll < maxScroll - 0.01) {
			const start = top + contentHeight;
			const gradient = ctx.createLinearGradient(0, start, 0, start + padding);
			gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
			gradient.addColorStop(1, color);
			ctx.fillStyle = gradient;
			ctx.fillRect(left, start, Math.max(1, width), padding);
		}
	}

	#drawLineNumbers(
		ctx: CanvasRenderingContext2D,
		code: string,
		left: number,
		top: number,
		charWidth: number,
		lineHeight: number,
		gutter: number,
		scroll: number,
		alpha: number
	) {
		if (gutter <= 0 || alpha <= 0) return;
		const lines = code.split('\n');
		ctx.save();
		ctx.globalAlpha *= alpha;
		ctx.textAlign = 'right';
		ctx.fillStyle = themes[getTheme()].comment ?? '#4a4a4a';
		for (let line = 0; line < lines.length; line++) {
			const y = top + (line - scroll) * lineHeight;
			if (y + lineHeight < top || y > top + lineHeight * this.#maxLinesSafe()) continue;
			ctx.fillText(String(line + 1), left + gutter - charWidth, y);
		}
		ctx.restore();
	}

	#drawTokens(
		ctx: CanvasRenderingContext2D,
		code: string,
		left: number,
		top: number,
		charWidth: number,
		lineHeight: number,
		gutter: number,
		scroll: number,
		alpha: number
	) {
		const tokens = this.#tokens(code);
		ctx.save();
		ctx.globalAlpha *= alpha;
		for (const token of tokens) {
			const [col, line] = token.to ?? [0, 0];
			const y = top + (line - scroll) * lineHeight;
			if (y + lineHeight < top || y > top + lineHeight * this.#maxLinesSafe()) continue;
			ctx.fillStyle = token.color || this.fill();
			ctx.fillText(token.code, left + gutter + col * charWidth, y);
		}
		ctx.restore();
	}

	#drawMorph(
		ctx: CanvasRenderingContext2D,
		left: number,
		top: number,
		charWidth: number,
		lineHeight: number,
		gutter: number,
		scroll: number,
		progress: number
	) {
		ctx.save();
		const baseAlpha = ctx.globalAlpha;
		for (const token of this.morphTokens) {
			let line: number;
			let col: number;
			let alpha: number;
			if (token.morph === 'retain' && token.from && token.to) {
				line = lerp(token.from[1], token.to[1], progress);
				col = lerp(token.from[0], token.to[0], progress);
				alpha = 1;
			} else if (token.morph === 'create' && token.to) {
				line = token.to[1];
				col = token.to[0];
				// fade the old token out before the new one fades in, so they never overlap
				alpha = Math.max(0, progress * 2 - 1);
			} else if (token.morph === 'delete' && token.from) {
				line = token.from[1];
				col = token.from[0];
				alpha = Math.max(0, 1 - progress * 2);
			} else {
				continue;
			}
			const y = top + (line - scroll) * lineHeight;
			if (y + lineHeight < top || y > top + lineHeight * this.#maxLinesSafe()) continue;
			ctx.globalAlpha = baseAlpha * alpha;
			ctx.fillStyle = token.color || this.fill();
			ctx.fillText(token.code, left + gutter + col * charWidth, y);
		}
		ctx.restore();
	}

	#drawSelection(
		ctx: CanvasRenderingContext2D,
		left: number,
		top: number,
		charWidth: number,
		lineHeight: number,
		gutter: number,
		scroll: number
	) {
		const selection = this.selection();
		const alpha = this.selectionAlpha();
		if (!selection || alpha <= 0) return;
		ctx.save();
		ctx.globalAlpha *= alpha;
		ctx.fillStyle = this.selectionFill();
		for (let line = selection.start.line; line <= selection.end.line; line++) {
			const start = line === selection.start.line ? selection.start.col : 0;
			const end = line === selection.end.line ? selection.end.col : Number.MAX_SAFE_INTEGER;
			const y = top + (line - scroll) * lineHeight;
			if (y + lineHeight < top || y > top + lineHeight * this.#maxLinesSafe()) continue;
			const x = left + gutter + start * charWidth;
			const width = Math.max(charWidth * 0.4, (end - start) * charWidth);
			ctx.fillRect(x, y, width, lineHeight);
		}
		ctx.restore();
	}

	#maxLinesSafe(): number {
		return this.maxLines() ?? Number.MAX_SAFE_INTEGER;
	}

	override saveState(): NodeState {
		return {
			...super.saveState(),
			code: this.code(),
			language: this.language(),
			previousCode: this.previousCode,
			morphTokens: this.morphTokens,
			transition: this.transition(),
			fontSize: this.fontSize(),
			lineHeight: this.lineHeight(),
			fontFamily: this.fontFamily(),
			lineNumbers: this.lineNumbers(),
			fill: this.fill(),
			tabSize: this.tabSize(),
			maxLines: this.maxLines(),
			minLines: this.minLines(),
			minCols: this.minCols(),
			selectionFill: this.selectionFill(),
			selection: this.selection(),
			selectionAlpha: this.selectionAlpha(),
			scroll: this.scroll(),
			cursor: this.cursor(),
			cursorAlpha: this.cursorAlpha(),
			cursorFill: this.cursorFill(),
			scrollFadeColor: this.scrollFadeColor(),
			scrollFadeSize: this.scrollFadeSize()
		};
	}

	override restoreState(state: NodeState) {
		super.restoreState(state);
		if (typeof state.code === 'string') this.code(state.code);
		if (typeof state.language === 'string') this.language(state.language);
		if (state.previousCode === null || typeof state.previousCode === 'string') {
			this.previousCode = state.previousCode;
		}
		if (Array.isArray(state.morphTokens)) this.morphTokens = state.morphTokens as MorphToken[];
		if (typeof state.transition === 'number') this.transition(state.transition);
		if (typeof state.fontSize === 'number') this.fontSize(state.fontSize);
		if (typeof state.lineHeight === 'number') this.lineHeight(state.lineHeight);
		if (typeof state.fontFamily === 'string') this.fontFamily(state.fontFamily);
		if (typeof state.lineNumbers === 'boolean') this.lineNumbers(state.lineNumbers);
		if (typeof state.fill === 'string') this.fill(state.fill);
		if (typeof state.tabSize === 'number') this.tabSize(state.tabSize);
		if (state.maxLines === null || typeof state.maxLines === 'number') {
			this.maxLines(state.maxLines);
		}
		if (typeof state.minLines === 'number') this.minLines(state.minLines);
		if (typeof state.minCols === 'number') this.minCols(state.minCols);
		if (typeof state.selectionFill === 'string') this.selectionFill(state.selectionFill);
		if (state.selection === null || typeof state.selection === 'object') {
			this.selection(state.selection as CodeRange | null);
		}
		if (typeof state.selectionAlpha === 'number') this.selectionAlpha(state.selectionAlpha);
		if (typeof state.scroll === 'number') this.scroll(state.scroll);
		if (state.cursor === null || typeof state.cursor === 'object') {
			this.cursor(state.cursor as CodePosition | null);
		}
		if (typeof state.cursorAlpha === 'number') this.cursorAlpha(state.cursorAlpha);
		if (typeof state.cursorFill === 'string') this.cursorFill(state.cursorFill);
		if (typeof state.scrollFadeColor === 'string') this.scrollFadeColor(state.scrollFadeColor);
		if (typeof state.scrollFadeSize === 'number') this.scrollFadeSize(state.scrollFadeSize);
	}
}

class CodeMorphStep implements Step {
	readonly label = 'code';
	readonly duration: number;
	#node: CodeNode;
	#code: string;
	#ease: Easing;
	#previous: string | null = null;

	constructor(node: CodeNode, code: string, duration: number, ease: Easing) {
		this.#node = node;
		this.#code = code;
		this.duration = duration;
		this.#ease = ease;
	}

	start() {
		this.#previous = this.#node.code();
		this.#node.previousCode = this.#previous;
		this.#node.code(this.#code);
		this.#node.morphTokens = [];
		this.#node.transition(0);
		this.#node.prepareMorph();
	}

	setProgress(progress: number) {
		this.#node.transition(this.#ease(clamp(progress, 0, 1)));
	}

	end() {
		this.#node.previousCode = null;
		this.#node.morphTokens = [];
		this.#node.transition(1);
	}

	revert() {
		if (this.#previous !== null) this.#node.code(this.#previous);
		this.#node.previousCode = null;
		this.#node.morphTokens = [];
		this.#node.transition(1);
		this.#previous = null;
	}
}

class CodeSelectionStep implements Step {
	readonly label = 'code selection';
	readonly duration: number;
	#node: CodeNode;
	#target: CodeRange | null;
	#ease: Easing;
	#previous: CodeRange | null = null;
	#previousAlpha = 0;

	constructor(node: CodeNode, target: CodeRange | null, duration: number, ease: Easing) {
		this.#node = node;
		this.#target = target;
		this.duration = duration;
		this.#ease = ease;
	}

	start() {
		this.#previous = this.#node.selection();
		this.#previousAlpha = this.#node.selectionAlpha();
		if (this.#target) {
			this.#node.selection(this.#target);
			this.#node.selectionAlpha(0);
		} else {
			this.#node.selectionAlpha(this.#previousAlpha);
		}
	}

	setProgress(progress: number) {
		const eased = this.#ease(clamp(progress, 0, 1));
		if (this.#target) this.#node.selectionAlpha(eased);
		else this.#node.selectionAlpha(this.#previousAlpha * (1 - eased));
	}

	end() {
		if (this.#target) {
			this.#node.selection(this.#target);
			this.#node.selectionAlpha(1);
		} else {
			this.#node.selection(null);
			this.#node.selectionAlpha(0);
		}
	}

	revert() {
		this.#node.selection(this.#previous);
		this.#node.selectionAlpha(this.#previousAlpha);
	}
}

class CodeCursorStep implements Step {
	readonly label = 'code cursor';
	readonly duration: number;
	#node: CodeNode;
	#target: CodePosition | null;
	#ease: Easing;
	#previous: CodePosition | null = null;
	#previousAlpha = 0;

	constructor(node: CodeNode, target: CodePosition | null, duration: number, ease: Easing) {
		this.#node = node;
		this.#target = target;
		this.duration = duration;
		this.#ease = ease;
	}

	start() {
		this.#previous = this.#node.cursor();
		this.#previousAlpha = this.#node.cursorAlpha();
		if (this.#target) this.#node.cursor(this.#target);
	}

	setProgress(progress: number) {
		const eased = this.#ease(clamp(progress, 0, 1));
		if (this.#target) this.#node.cursorAlpha(eased);
		else this.#node.cursorAlpha(this.#previousAlpha * (1 - eased));
	}

	end() {
		if (this.#target) {
			this.#node.cursor(this.#target);
			this.#node.cursorAlpha(1);
		} else {
			this.#node.cursor(null);
			this.#node.cursorAlpha(0);
		}
	}

	revert() {
		this.#node.cursor(this.#previous);
		this.#node.cursorAlpha(this.#previousAlpha);
	}
}

class CodeScrollStep implements Step {
	readonly label = 'code scroll';
	readonly duration: number;
	#node: CodeNode;
	#target: number;
	#ease: Easing;
	#previous = 0;

	constructor(node: CodeNode, line: number, duration: number, ease: Easing) {
		this.#node = node;
		this.#target = line;
		this.duration = duration;
		this.#ease = ease;
	}

	start() {
		this.#previous = this.#node.scroll();
	}

	setProgress(progress: number) {
		const eased = this.#ease(clamp(progress, 0, 1));
		this.#node.scroll(lerp(this.#previous, this.#target, eased));
	}

	end() {
		this.#node.scroll(this.#target);
	}

	revert() {
		this.#node.scroll(this.#previous);
	}
}

class CodeRevealStep implements Step {
	readonly label = 'code reveal';
	readonly duration: number;
	#selection: CodeSelectionStep;
	#scroll: CodeScrollStep;

	constructor(node: CodeNode, target: CodeRange, duration: number, ease: Easing) {
		this.#selection = new CodeSelectionStep(node, target, duration, ease);
		const max = node.maxLines();
		const scroll = max === null ? target.end.line : Math.max(0, target.end.line - max + 1);
		this.#scroll = new CodeScrollStep(node, scroll, duration, ease);
		this.duration = duration;
	}

	start() {
		this.#selection.start();
		this.#scroll.start();
	}

	setProgress(progress: number) {
		this.#selection.setProgress(progress);
		this.#scroll.setProgress(progress);
	}

	end() {
		this.#selection.end();
		this.#scroll.end();
	}

	revert() {
		this.#selection.revert();
		this.#scroll.revert();
	}
}
