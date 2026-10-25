import { clamp, easeInOut, type Easing } from './easing.js';
import { Node, type NodeInit, type NodeState, type Size } from './nodes.js';
import {
	createSignal,
	discreteInterpolate,
	numberSignal,
	stringSignal,
	type Signal
} from './signal.js';
import { Animation, type Step } from './steps.js';

interface CodeToken {
	text: string;
	col: number;
	line: number;
	color: string;
}

export interface CodeNodeInit extends NodeInit {
	code: string;
	language?: string;
	fontSize?: number;
	lineHeight?: number;
	fontFamily?: string;
	lineNumbers?: boolean;
	fill?: string;
}

const KEYWORDS = new Set([
	'const',
	'let',
	'var',
	'function',
	'return',
	'import',
	'from',
	'export',
	'default',
	'type',
	'interface',
	'new',
	'class',
	'extends',
	'yield',
	'async',
	'await',
	'if',
	'else',
	'for',
	'of',
	'in',
	'true',
	'false',
	'null',
	'undefined'
]);

const COLORS = {
	plain: '#e4e4e7',
	keyword: '#fbbf24',
	string: '#a3e635',
	number: '#f472b6',
	comment: '#71717a'
};

function tokenColor(token: string): string {
	if (token.startsWith('//')) return COLORS.comment;
	if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) return COLORS.string;
	if (/^\d/.test(token)) return COLORS.number;
	if (KEYWORDS.has(token)) return COLORS.keyword;
	return COLORS.plain;
}

function tokenize(code: string): CodeToken[] {
	const tokens: CodeToken[] = [];
	const pattern =
		/\/\/.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:const|let|var|function|return|import|from|export|default|type|interface|new|class|extends|yield|async|await|if|else|for|of|in|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b/g;

	code.split('\n').forEach((line, lineIndex) => {
		let cursor = 0;
		let match: RegExpExecArray | null;

		while ((match = pattern.exec(line)) !== null) {
			if (match.index > cursor) {
				tokens.push({
					text: line.slice(cursor, match.index),
					col: cursor,
					line: lineIndex,
					color: COLORS.plain
				});
			}
			tokens.push({
				text: match[0],
				col: match.index,
				line: lineIndex,
				color: tokenColor(match[0])
			});
			cursor = match.index + match[0].length;
		}

		if (cursor < line.length) {
			tokens.push({
				text: line.slice(cursor),
				col: cursor,
				line: lineIndex,
				color: COLORS.plain
			});
		}
	});

	return tokens;
}

export class CodeNode extends Node {
	override readonly kind = 'code';
	readonly code: Signal<string>;
	readonly fontSize: Signal<number>;
	readonly lineHeight: Signal<number>;
	readonly fontFamily: Signal<string>;
	readonly lineNumbers: Signal<boolean>;
	readonly fill: Signal<string>;
	readonly transition: Signal<number>;
	previousCode: string | null = null;

	constructor(init: CodeNodeInit) {
		super(init);
		this.code = stringSignal(init.code, `${this.id}.code`);
		this.fontSize = numberSignal(init.fontSize ?? 26, `${this.id}.fontSize`);
		this.lineHeight = numberSignal(init.lineHeight ?? 1.5, `${this.id}.lineHeight`);
		this.fontFamily = stringSignal(
			init.fontFamily ?? "'JetBrains Mono', ui-monospace, monospace",
			`${this.id}.fontFamily`
		);
		this.lineNumbers = createSignal(
			init.lineNumbers ?? true,
			discreteInterpolate,
			`${this.id}.lineNumbers`
		);
		this.fill = stringSignal(init.fill ?? COLORS.plain, `${this.id}.fill`);
		this.transition = numberSignal(1, `${this.id}.transition`);
	}

	get font(): string {
		return `${this.fontSize()}px ${this.fontFamily()}`;
	}

	morphTo(code: string, duration = 0.6, ease: Easing = easeInOut): Animation {
		return new Animation(new CodeMorphStep(this, code, duration, ease));
	}

	measure(ctx: CanvasRenderingContext2D): Size {
		ctx.save();
		ctx.font = this.font;
		const charWidth = ctx.measureText('M').width;
		ctx.restore();

		const lines = this.code().split('\n');
		const digits = String(lines.length).length;
		const gutter = this.lineNumbers() ? (digits + 1) * charWidth : 0;
		const cols = lines.reduce((longest, line) => Math.max(longest, line.length), 0);
		return {
			width: cols * charWidth + gutter,
			height: Math.max(1, lines.length) * this.fontSize() * this.lineHeight()
		};
	}

	drawSelf(ctx: CanvasRenderingContext2D) {
		ctx.save();
		ctx.font = this.font;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';

		const charWidth = ctx.measureText('M').width;
		const lineHeight = this.fontSize() * this.lineHeight();
		const currentLines = this.code().split('\n');
		const digits = String(currentLines.length).length;
		const gutter = this.lineNumbers() ? (digits + 1) * charWidth : 0;
		const cols = currentLines.reduce((longest, line) => Math.max(longest, line.length), 0);
		const width = cols * charWidth + gutter;
		const height = Math.max(1, currentLines.length) * lineHeight;
		const left = -width / 2;
		const top = -height / 2;
		const progress = clamp(this.transition(), 0, 1);

		if (this.previousCode !== null && progress < 1) {
			this.#drawCode(
				ctx,
				this.previousCode,
				left,
				top,
				charWidth,
				lineHeight,
				gutter,
				1 - progress
			);
		}
		this.#drawCode(ctx, this.code(), left, top, charWidth, lineHeight, gutter, progress);

		ctx.restore();
	}

	#drawCode(
		ctx: CanvasRenderingContext2D,
		code: string,
		left: number,
		top: number,
		charWidth: number,
		lineHeight: number,
		gutter: number,
		alpha: number
	) {
		ctx.save();
		ctx.globalAlpha *= alpha;

		if (gutter > 0) {
			const lines = code.split('\n');
			ctx.textAlign = 'right';
			ctx.fillStyle = COLORS.comment;
			for (let line = 0; line < lines.length; line++) {
				ctx.fillText(String(line + 1), left + gutter - charWidth, top + line * lineHeight);
			}
			ctx.textAlign = 'left';
		}

		for (const token of tokenize(code)) {
			ctx.fillStyle = token.color === COLORS.plain ? this.fill() : token.color;
			ctx.fillText(
				token.text,
				left + gutter + token.col * charWidth,
				top + token.line * lineHeight
			);
		}

		ctx.restore();
	}

	override saveState(): NodeState {
		return {
			...super.saveState(),
			code: this.code(),
			previousCode: this.previousCode,
			transition: this.transition(),
			fontSize: this.fontSize(),
			lineHeight: this.lineHeight(),
			fontFamily: this.fontFamily(),
			lineNumbers: this.lineNumbers(),
			fill: this.fill()
		};
	}

	override restoreState(state: NodeState) {
		super.restoreState(state);
		if (typeof state.code === 'string') this.code(state.code);
		if (state.previousCode === null || typeof state.previousCode === 'string') {
			this.previousCode = state.previousCode;
		}
		if (typeof state.transition === 'number') this.transition(state.transition);
		if (typeof state.fontSize === 'number') this.fontSize(state.fontSize);
		if (typeof state.lineHeight === 'number') this.lineHeight(state.lineHeight);
		if (typeof state.fontFamily === 'string') this.fontFamily(state.fontFamily);
		if (typeof state.lineNumbers === 'boolean') this.lineNumbers(state.lineNumbers);
		if (typeof state.fill === 'string') this.fill(state.fill);
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
		this.#node.transition(0);
	}

	setProgress(progress: number) {
		this.#node.transition(this.#ease(clamp(progress, 0, 1)));
	}

	end() {
		this.#node.previousCode = null;
		this.#node.transition(1);
	}

	revert() {
		if (this.#previous !== null) this.#node.code(this.#previous);
		this.#node.previousCode = null;
		this.#node.transition(1);
		this.#previous = null;
	}
}
