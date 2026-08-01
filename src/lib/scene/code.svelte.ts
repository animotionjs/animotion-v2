import { createContext } from 'svelte';
import { highlight, type MorphToken, type PositionedToken } from './lezer';

export type CodeRange = [[number, number], [number, number]];

export interface CodeState {
	language: string;
	resolved: string;
	settled: PositionedToken[];
	tokens: MorphToken[] | null;
	progress: number;
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

export function word(line: number, col: number, length?: number): CodeRange {
	return [
		[line, col],
		[line, length !== undefined ? col + length : Infinity]
	];
}

export function lines(from: number, to?: number): CodeRange[] {
	return [
		[
			[from, 0],
			[to ?? from, Infinity]
		]
	];
}

export function range(sl: number, sc: number, el: number, ec: number): CodeRange {
	return [
		[sl, sc],
		[el, ec]
	];
}

export function position(line: number, col: number): CodeRange {
	return [
		[line, col],
		[line, col]
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
 * Re-indents `code` based on `{`, `(`, `[` nesting.
 *
 * Leading whitespace on every line is replaced by `unit` repeated `depth`
 * times, where `depth` is the number of unclosed opening brackets seen on
 * previous lines (minus one if the line starts with a closing bracket).
 * Lines continuing a chained method call (starting with `.` or `?.`) are
 * indented one unit beyond the statement they belong to.
 * Braces inside strings, templates and comments are ignored, and lines that
 * continue inside a multi-line string/template/comment are left untouched.
 * Leading and trailing blank lines are dropped. Idempotent.
 */
const CHAIN_START = /^(\?\.|\.\s*[$A-Z_a-z(])/;

export function smartIndent(code: string, unit = '  '): string {
	const lines = code.split('\n');
	const out: string[] = [];
	let depth = 0;
	let statementLevel = 0;
	let inBlockComment = false;
	let inTemplate = false;
	let inString: "'" | '"' | null = null;
	let escaped = false;

	for (const raw of lines) {
		const insideContinuation = inBlockComment || inTemplate || inString !== null;
		const trimmed = raw.trim();

		if (trimmed.length === 0) {
			out.push(insideContinuation ? raw : '');
		} else if (insideContinuation) {
			out.push(raw);
		} else {
			const closes = trimmed[0] === '}' || trimmed[0] === ')' || trimmed[0] === ']';
			const chain = !closes && CHAIN_START.test(trimmed);
			const level = chain ? statementLevel + 1 : Math.max(0, depth - (closes ? 1 : 0));
			out.push(unit.repeat(level) + trimmed);
			if (!chain) statementLevel = level;
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
			if (ch === '{' || ch === '(' || ch === '[') {
				depth++;
			} else if (ch === '}' || ch === ')' || ch === ']') {
				depth = Math.max(0, depth - 1);
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
		progress: 1,
		selection: ALL_LINES,
		selectionProgress: null,
		previousSelection: null
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
