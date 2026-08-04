import { createContext } from 'svelte';
import {
	highlight,
	onHighlighterReady,
	type MorphToken,
	type PositionedToken
} from './highlighter';

export type CodeRange = [[number, number], [number, number]];

export interface CodeState {
	language: string;
	resolved: string;
	settled: PositionedToken[];
	tokens: MorphToken[] | null;
	rawProgress: number;
	progress: number;
	morphProgress: number;
	selection: CodeRange[];
	selectionProgress: number | null;
	previousSelection: CodeRange[] | null;
}

export const [getCodeState, setCodeState] = createContext<CodeState>();

export const DEFAULT = Symbol('DEFAULT');

export interface RawCodeFragment {
	before: string;
	after: string;
}

export type RangeResolver = (code: string) => CodeRange | CodeRange[];
export type SingleRangeResolver = (code: string) => CodeRange;

export const ALL_LINES: CodeRange[] = [
	[
		[0, 0],
		[Infinity, Infinity]
	]
];

export function insert(text: string): RawCodeFragment {
	return { before: '', after: text };
}

export function remove(text: string): RawCodeFragment {
	return { before: text, after: '' };
}

export function replace(from: string, to: string): RawCodeFragment {
	return { before: from, after: to };
}

function assertLine(line: number): void {
	if (line < 1) {
		throw new Error(
			`Lines are 1-indexed — the first line is 1, but you passed ${line}. Did you mean ${Math.max(1, line + 1)}?`
		);
	}
}

export function word(line: number, col: number, length?: number): CodeRange {
	assertLine(line);
	return [
		[line - 1, col],
		[line - 1, length !== undefined ? col + length : Infinity]
	];
}

export function lines(from: number, to?: number): CodeRange[] {
	assertLine(from);
	if (to !== undefined) assertLine(to);
	return [
		[
			[from - 1, 0],
			[to !== undefined ? to - 1 : from - 1, Infinity]
		]
	];
}

export function range(sl: number, sc: number, el: number, ec: number): CodeRange {
	assertLine(sl);
	assertLine(el);
	return [
		[sl - 1, sc],
		[el - 1, ec]
	];
}

export function position(line: number, col: number): CodeRange {
	assertLine(line);
	return [
		[line - 1, col],
		[line - 1, col]
	];
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findFirstInCode(code: string, pattern: string | RegExp): CodeRange | null {
	const idx = typeof pattern === 'string' ? code.indexOf(pattern) : code.search(pattern);
	if (idx === -1) return null;
	const before = code.slice(0, idx);
	const startLine = before.split('\n').length - 1;
	const startCol = before.length - before.lastIndexOf('\n') - 1;
	const len =
		typeof pattern === 'string'
			? pattern.length
			: (code.slice(idx).match(pattern)?.[0]?.length ?? 0);
	return [
		[startLine, startCol],
		[startLine, startCol + len]
	];
}

function findAllInCode(code: string, pattern: string | RegExp): CodeRange[] {
	const ranges: CodeRange[] = [];
	const regex = typeof pattern === 'string' ? new RegExp(escapeRegex(pattern), 'g') : pattern;
	let m: RegExpExecArray | null;
	while ((m = regex.exec(code)) !== null) {
		if (m.index === regex.lastIndex) regex.lastIndex++;
		const before = code.slice(0, m.index);
		const startLine = before.split('\n').length - 1;
		const startCol = before.length - before.lastIndexOf('\n') - 1;
		ranges.push([
			[startLine, startCol],
			[startLine, startCol + m[0].length]
		]);
	}
	return ranges;
}

function findLastInCode(code: string, pattern: string | RegExp): CodeRange | null {
	const ranges = findAllInCode(code, pattern);
	return ranges.length > 0 ? ranges[ranges.length - 1] : null;
}

export function FIRST(pattern: string | RegExp): SingleRangeResolver {
	return (code: string) => {
		const r = findFirstInCode(code, pattern);
		if (!r) throw new Error(`FIRST: pattern not found in code`);
		return r;
	};
}

export function ALL(pattern: string | RegExp): RangeResolver {
	return (code: string) => findAllInCode(code, pattern);
}

export function LAST(pattern: string | RegExp): SingleRangeResolver {
	return (code: string) => {
		const r = findLastInCode(code, pattern);
		if (!r) throw new Error(`LAST: pattern not found in code`);
		return r;
	};
}

export function makeCodeTree(code: string): string {
	return code;
}

/**
 * Re-indents `code` based on `{`, `(`, `[` nesting plus HTML tag nesting.
 *
 * Leading whitespace on every line is replaced by `unit` repeated `level`
 * times. Nesting is tracked with a stack of open blocks, each entry storing
 * the indent level of the line that opened it plus the statement base in
 * effect at that point:
 *   - a plain line sits one level below the innermost open block (`top.level + 1`);
 *   - a line starting with a closing bracket or closing tag aligns with the
 *     block it closes (`top.level`);
 *   - a line continuing a chained method call (starting with `.` or `?.`) sits
 *     one level beyond the statement it belongs to (`base + 1`).
 * Every opening bracket or tag pushes an entry (even when several appear on
 * the same line, e.g. `foo({` or `<button onclick={...}>`), and every closing
 * bracket or tag pops its own kind, so braces and tags stay balanced.
 * Self-closing tags and void elements (`<br>`, `<img>`, ...) never push.
 * Braces inside strings, templates, comments and tag attributes are ignored,
 * and lines that continue inside a multi-line string/template/comment are left
 * untouched. A `<` is only treated as an opening tag when followed by a letter
 * and at the start of the line or preceded by whitespace or `>`; closing tags
 * (`</`) are always recognised. TS generics (`foo<number>`) and comparisons
 * (`a < b`) are therefore not misread as tags.
 * Leading and trailing blank lines are dropped. Idempotent.
 */
const CHAIN_START = /^(\?\.|\.\s*[$A-Z_a-z(])/;

const VOID_ELEMENTS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr'
]);

type BlockKind = 'brace' | 'tag';

interface IndentBlock {
	kind: BlockKind;
	level: number;
	base: number;
	name?: string;
}

function popKind(stack: IndentBlock[], kind: BlockKind): IndentBlock | undefined {
	for (let i = stack.length - 1; i >= 0; i--) {
		if (stack[i].kind === kind) return stack.splice(i, 1)[0];
	}
	return undefined;
}

function popTag(stack: IndentBlock[], name: string): IndentBlock | undefined {
	for (let i = stack.length - 1; i >= 0; i--) {
		if (stack[i].kind === 'tag' && stack[i].name === name) return stack.splice(i, 1)[0];
	}
	return undefined;
}

function scanTag(
	raw: string,
	start: number
): { closing: boolean; selfClosing: boolean; name: string; end: number } | null {
	let i = start + 1;
	let closing = false;
	if (raw[i] === '/') {
		closing = true;
		i++;
	}
	if (raw[i] === '!' || raw[i] === '?') return null;
	if (!/[A-Za-z]/.test(raw[i] ?? '')) return null;
	const nameStart = i;
	while (i < raw.length && /[A-Za-z0-9-]/.test(raw[i])) i++;
	const name = raw.slice(nameStart, i);
	let quote: string | null = null;
	let selfClosing = false;
	while (i < raw.length) {
		const c = raw[i];
		if (quote) {
			if (c === quote) quote = null;
		} else if (c === '"' || c === "'") {
			quote = c;
		} else if (c === '/' && raw[i + 1] === '>') {
			selfClosing = true;
		} else if (c === '>') {
			break;
		}
		i++;
	}
	if (i >= raw.length) return null;
	return { closing, selfClosing, name, end: i };
}

export function smartIndent(code: string, unit = '  '): string {
	const lines = code.split('\n');
	const out: string[] = [];
	const stack: IndentBlock[] = [];
	let base = 0;
	let inBlockComment = false;
	let inTemplate = false;
	let inString: "'" | '"' | null = null;
	let escaped = false;

	for (const raw of lines) {
		const insideContinuation = inBlockComment || inTemplate || inString !== null;
		const trimmed = raw.trim();
		let level = 0;

		if (trimmed.length === 0) {
			out.push(insideContinuation ? raw : '');
		} else if (insideContinuation) {
			out.push(raw);
		} else {
			const top = stack[stack.length - 1];
			const closesBracket = trimmed[0] === '}' || trimmed[0] === ')' || trimmed[0] === ']';
			const closesTag = trimmed[0] === '<' && trimmed[1] === '/';
			const closes = closesBracket || closesTag;
			const chain = !closes && CHAIN_START.test(trimmed);

			if (chain) {
				level = base + 1;
			} else if (closes) {
				level = top ? top.level : 0;
			} else {
				level = top ? top.level + 1 : 0;
			}

			out.push(unit.repeat(level) + trimmed);
			if (!chain && !closes) base = level;
		}

		for (let i = 0; i < raw.length; i++) {
			const ch = raw[i];
			if (escaped) {
				escaped = false;
				continue;
			}
			if (inString !== null) {
				if (ch === '\\') escaped = true;
				else if (ch === inString) inString = null;
				continue;
			}
			if (inTemplate) {
				if (ch === '\\') escaped = true;
				else if (ch === '`') inTemplate = false;
				continue;
			}
			if (inBlockComment) {
				if (ch === '*' && raw[i + 1] === '/') {
					inBlockComment = false;
					i++;
				}
				continue;
			}
			if (ch === '/' && raw[i + 1] === '/') break;
			if (ch === '/' && raw[i + 1] === '*') {
				inBlockComment = true;
				i++;
				continue;
			}
			if (ch === "'" || ch === '"') {
				inString = ch;
				continue;
			}
			if (ch === '`') {
				inTemplate = true;
				continue;
			}
			if (
				ch === '<' &&
				(raw[i + 1] === '/' || i === 0 || /\s/.test(raw[i - 1] ?? '') || raw[i - 1] === '>')
			) {
				const tag = scanTag(raw, i);
				if (tag) {
					if (tag.closing) {
						const popped = popTag(stack, tag.name);
						if (popped) base = popped.base;
					} else if (!tag.selfClosing && !VOID_ELEMENTS.has(tag.name)) {
						stack.push({ kind: 'tag', level, base, name: tag.name });
					}
					i = tag.end - 1;
					continue;
				}
			}
			if (ch === '{' || ch === '(' || ch === '[') {
				stack.push({ kind: 'brace', level, base });
			} else if (ch === '}' || ch === ')' || ch === ']') {
				const popped = popKind(stack, 'brace');
				if (popped) base = popped.base;
			}
		}
	}

	return out.join('\n').replace(/^\n+|\n+$/g, '');
}

export const code = {
	insert,
	remove,
	replace,
	word,
	lines,
	range,
	position,
	FIRST,
	ALL,
	LAST,
	DEFAULT,
	ALL_LINES,
	smartIndent
};

export function codeToText(code: string): string {
	return code;
}
export function buildEditTrees(
	strings: TemplateStringsArray,
	tags: (string | RawCodeFragment)[]
): { from: string; to: string; resolved: string } {
	let fromCode = strings[0];
	let toCode = strings[0];

	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];
		if (typeof tag === 'string') {
			fromCode += tag;
			toCode += tag;
		} else {
			fromCode += tag.before;
			toCode += tag.after;
		}
		fromCode += strings[i + 1];
		toCode += strings[i + 1];
	}

	return { from: fromCode, to: toCode, resolved: toCode };
}

export function createCodeState(language: string, initial: string): CodeState {
	let settled: PositionedToken[];
	try {
		settled = highlight(initial, language);
	} catch {
		settled = [];
	}
	const state = $state<CodeState>({
		language,
		resolved: initial,
		settled,
		tokens: null,
		rawProgress: 1,
		progress: 1,
		morphProgress: 1,
		selection: ALL_LINES,
		selectionProgress: null,
		previousSelection: null
	});

	onHighlighterReady(() => {
		if (state.tokens === null) {
			state.settled = highlight(state.resolved, state.language);
		}
	});

	return state;
}

export function isRangeResolver(v: unknown): v is RangeResolver {
	return typeof v === 'function';
}

function isRangeArray(v: unknown): v is CodeRange[] {
	return Array.isArray(v) && v.length > 0 && Array.isArray(v[0]) && Array.isArray(v[0][0]);
}

export function resolveSingleRange(
	arg: CodeRange | CodeRange[] | RangeResolver | string,
	code: string
): CodeRange {
	if (typeof arg === 'string') return FIRST(arg)(code);
	if (isRangeResolver(arg)) {
		const result = arg(code);
		return isRangeArray(result) ? result[0] : result;
	}
	return isRangeArray(arg) ? arg[0] : arg;
}

export function resolveRangeArray(
	arg: CodeRange | CodeRange[] | RangeResolver | string,
	code: string
): CodeRange[] {
	if (typeof arg === 'string') return [FIRST(arg)(code)];
	if (isRangeResolver(arg)) {
		const result = arg(code);
		return isRangeArray(result) ? result : [result];
	}
	return isRangeArray(arg) ? arg : [arg];
}

function lineColToIndex(code: string, line: number, col: number): number {
	const lines = code.split('\n');
	let idx = 0;
	for (let i = 0; i < Math.min(line, lines.length); i++) {
		idx += lines[i].length + 1;
	}
	return idx + Math.min(col, lines[Math.min(line, lines.length - 1)]?.length ?? 0);
}

export function codeRangeToSplice(code: string, range: CodeRange): { start: number; end: number } {
	const [[sl, sc], [el, ec]] = range;
	const start = lineColToIndex(code, sl, sc);
	const end = ec === Infinity ? code.length : lineColToIndex(code, el, ec);
	return { start, end };
}

export function applyRangeEdit(code: string, range: CodeRange, replacement: string): string {
	const { start, end } = codeRangeToSplice(code, range);
	return code.slice(0, start) + replacement + code.slice(end);
}

export function isInSelection(
	line: number,
	col: number,
	textLen: number,
	selection: CodeRange[]
): boolean {
	if (!selection || selection.length === 0) return true;
	for (const [[sl, sc], [el, ec]] of selection) {
		const startY = sl,
			startX = sc;
		const endY = el,
			endX = ec;
		const spanEndLine = line;
		const spanEndCol = col + textLen;
		if (spanEndLine < startY || (spanEndLine === startY && spanEndCol <= startX)) continue;
		if (line > endY || (line === endY && col >= endX)) continue;
		return true;
	}
	return false;
}
