import { DEFAULT_THEME, themes, type Theme } from './themes.js';
import {
	setOptions,
	type AspectRatio,
	type RenderOptionsInput,
	type TransitionConfig
} from '../options.js';

export type Tokenizer = (code: string) => { tokens: Uint32Array; token_types: string[] };

/** A language package factory, e.g. `tokenize` from `@twinkleplop/rust`. Called once with no arguments. */
export type LanguageFactory = () => Tokenizer;

const tokenizers: Record<string, Tokenizer> = {};

let theme: Theme = DEFAULT_THEME;

/* Refresh waiters fire only when the theme changes, the sole late event
in the synchronous backend */
let refreshWaiters: (() => void)[] = [];

function notifyRefreshWaiters() {
	const waiters = refreshWaiters;
	refreshWaiters = [];
	for (const waiter of waiters) waiter();
}

/** Presentation-wide highlighter and render settings. */
export interface ConfigureOptions {
	theme?: Theme;
	languages?: Record<string, LanguageFactory>;
	aspectRatio?: AspectRatio;
	render?: RenderOptionsInput;
	transition?: TransitionConfig | null;
}

export function configure(options: ConfigureOptions) {
	if (options.theme && themes[options.theme] && options.theme !== theme) {
		theme = options.theme;
		notifyRefreshWaiters();
	}
	if (options.languages) {
		for (const [name, factory] of Object.entries(options.languages)) {
			tokenizers[name] = factory();
		}
		notifyRefreshWaiters();
	}
	if (options.aspectRatio || options.render || options.transition) {
		setOptions({
			aspectRatio: options.aspectRatio,
			render: options.render,
			transition: options.transition
		});
	}
}

export function whenReady(): Promise<void> {
	return Promise.resolve();
}

/** Calls `callback` immediately. There is no async init to wait for. */
export function onHighlighterReady(callback: () => void) {
	callback();
}

/** Always true. Tokenizers are created at import time. */
export function isHighlighterReady(): boolean {
	return true;
}

/**
 * Calls `callback` on the next theme change. Never fires otherwise.
 */
export function onHighlighterRefresh(callback: () => void) {
	refreshWaiters.push(callback);
}

/** A highlighted token with its source text and resolved color. */
export interface Token {
	code: string;
	color: string;
}

/** A token positioned within the code grid. `line` and `col` are 0-indexed. */
export interface PositionedToken extends Token {
	line: number;
	col: number;
}

/**
 * A token in a diff between two code states. `from`/`to` are `[col, line]`
 * positions (0-indexed) of the token on each side, or `null` on the side
 * where the token does not exist.
 */
export interface MorphToken extends Token {
	morph: 'create' | 'delete' | 'retain';
	from: [number, number] | null;
	to: [number, number] | null;
}

// brackets share one muted color while other punctuation keeps the text color
const BRACKETS = new Set(['(', ')', '{', '}', '[', ']']);

function pushPunctuation(
	out: PositionedToken[],
	text: string,
	color: string,
	muted: string,
	line: number,
	col: number
): { line: number; col: number } {
	let run = '';
	let runMuted = false;
	function flush() {
		if (run.length === 0) return;
		({ line, col } = pushText(out, run, runMuted ? muted : color, line, col));
		run = '';
	}
	for (const char of text) {
		const mutedChar = BRACKETS.has(char);
		if (run.length > 0 && mutedChar !== runMuted) flush();
		runMuted = mutedChar;
		run += char;
	}
	flush();
	return { line, col };
}

function pushText(
	out: PositionedToken[],
	text: string,
	color: string,
	line: number,
	col: number
): { line: number; col: number } {
	const parts = text.split('\n');
	for (let i = 0; i < parts.length; i++) {
		if (i > 0) {
			line++;
			col = 0;
		}
		if (parts[i].length === 0) continue;
		out.push({ code: parts[i], color, line, col });
		col += parts[i].length;
	}
	return { line, col };
}

/**
 * Tokenizes `code` with the current theme.
 *
 * @returns positioned tokens, or `[]` if the language is unknown
 */
export function highlight(code: string, language: string): PositionedToken[] {
	const tokenize = tokenizers[language];
	if (!tokenize) return [];
	const colors = themes[theme];
	// plain text inherits the identifier color, matching the theme stylesheet
	const fg = colors['identifier'] ?? '';
	try {
		const { tokens, token_types } = tokenize(code);
		const positioned: PositionedToken[] = [];
		let line = 0;
		let col = 0;
		let cursor = 0;
		for (let i = 0; i < tokens.length; i += 3) {
			const name = token_types[tokens[i]];
			const start = tokens[i + 1];
			const end = tokens[i + 2];
			// twinkleplop leaves whitespace between tokens uncovered, so gaps become plain spans
			if (start > cursor) {
				const gap = code.slice(cursor, start);
				({ line, col } = pushText(positioned, gap, fg, line, col));
			}
			const color = colors[name] ?? fg;
			if (name === 'punctuation') {
				({ line, col } = pushPunctuation(
					positioned,
					code.slice(start, end),
					color,
					colors['bracket'] ?? fg,
					line,
					col
				));
			} else {
				({ line, col } = pushText(positioned, code.slice(start, end), color, line, col));
			}
			cursor = end;
		}
		if (cursor < code.length) {
			pushText(positioned, code.slice(cursor), fg, line, col);
		}
		return positioned;
	} catch {
		return [];
	}
}

type Subsequence = {
	aIndex: number;
	bIndex: number;
	prev?: Subsequence;
};

type DiffLine = { line: string; aIndex: number; bIndex: number; moved: boolean };

function findUnique(
	lines: string[],
	start: number,
	end: number
): Map<string, { count: number; index: number }> {
	const lineMap = new Map<string, { count: number; index: number }>();
	for (let i = start; i <= end; i++) {
		const line = lines[i];
		const data = lineMap.get(line);
		if (data) {
			data.count++;
			data.index = i;
		} else {
			lineMap.set(line, { count: 1, index: i });
		}
	}
	const newMap = new Map<string, { count: number; index: number }>();
	for (const [key, value] of lineMap) {
		if (value.count === 1) {
			newMap.set(key, value);
		}
	}
	return newMap;
}

function uniqueCommon(
	aArray: string[],
	aStart: number,
	aEnd: number,
	bArray: string[],
	bStart: number,
	bEnd: number
): Map<string, Subsequence> {
	const aUnique = findUnique(aArray, aStart, aEnd);
	const bUnique = findUnique(bArray, bStart, bEnd);
	const paired = new Map<string, Subsequence>();
	for (const [key, value] of aUnique) {
		const bIndex = bUnique.get(key);
		if (bIndex !== undefined) {
			paired.set(key, { aIndex: value.index, bIndex: bIndex.index });
		}
	}
	return paired;
}

function longestCommonSubsequence(abMap: Map<string, Subsequence>): Subsequence[] {
	const jagged: Subsequence[][] = [];
	for (const value of abMap.values()) {
		let i = 0;
		while (jagged[i] && jagged[i][jagged[i].length - 1].bIndex < value.bIndex) i++;
		if (i > 0) value.prev = jagged[i - 1][jagged[i - 1].length - 1];
		if (!jagged[i]) jagged[i] = [value];
		else jagged[i].push(value);
	}
	if (jagged.length === 0) return [];
	const lcs: Subsequence[] = [jagged[jagged.length - 1][jagged[jagged.length - 1].length - 1]];
	let cursor = lcs[0];
	while (cursor.prev) {
		cursor = cursor.prev;
		lcs.push(cursor);
	}
	return lcs.reverse();
}

/**
 * Computes a line-level diff using the patience algorithm. Each result line
 * carries a matching pair of indices, or `-1` on the side that is absent.
 */
function patienceDiff(
	aLines: string[],
	bLines: string[]
): { lines: DiffLine[]; lineCountDeleted: number; lineCountInserted: number } {
	const result: DiffLine[] = [];
	let deleted = 0;
	let inserted = 0;

	function addToResult(aIndex: number, bIndex: number) {
		if (bIndex < 0) deleted++;
		else if (aIndex < 0) inserted++;
		result.push({
			line: aIndex >= 0 ? aLines[aIndex] : bLines[bIndex],
			aIndex,
			bIndex,
			moved: false
		});
	}

	function addSubMatch(aStart: number, aEnd: number, bStart: number, bEnd: number) {
		while (aStart <= aEnd && bStart <= bEnd && aLines[aStart] === bLines[bStart]) {
			addToResult(aStart++, bStart++);
		}
		const aEndTemp = aEnd;
		while (aStart <= aEnd && bStart <= bEnd && aLines[aEnd] === bLines[bEnd]) {
			aEnd--;
			bEnd--;
		}
		const uniqueCommonMap = uniqueCommon(aLines, aStart, aEnd, bLines, bStart, bEnd);
		if (uniqueCommonMap.size === 0) {
			while (aStart <= aEnd) addToResult(aStart++, -1);
			while (bStart <= bEnd) addToResult(-1, bStart++);
		} else {
			recurseLCS(aStart, aEnd, bStart, bEnd, uniqueCommonMap);
		}
		while (aEnd < aEndTemp) addToResult(++aEnd, ++bEnd);
	}

	function recurseLCS(
		aStart: number,
		aEnd: number,
		bStart: number,
		bEnd: number,
		ucMap = uniqueCommon(aLines, aStart, aEnd, bLines, bStart, bEnd)
	) {
		const lcs = longestCommonSubsequence(ucMap);
		if (lcs.length === 0) {
			addSubMatch(aStart, aEnd, bStart, bEnd);
		} else {
			if (aStart < lcs[0].aIndex || bStart < lcs[0].bIndex)
				addSubMatch(aStart, lcs[0].aIndex - 1, bStart, lcs[0].bIndex - 1);
			for (let i = 0; i < lcs.length - 1; i++)
				addSubMatch(lcs[i].aIndex, lcs[i + 1].aIndex - 1, lcs[i].bIndex, lcs[i + 1].bIndex - 1);
			if (lcs[lcs.length - 1].aIndex <= aEnd || lcs[lcs.length - 1].bIndex <= bEnd)
				addSubMatch(lcs[lcs.length - 1].aIndex, aEnd, lcs[lcs.length - 1].bIndex, bEnd);
		}
	}

	recurseLCS(0, aLines.length - 1, 0, bLines.length - 1);
	return { lines: result, lineCountDeleted: deleted, lineCountInserted: inserted };
}

/**
 * Diffs two highlighted code strings into morph tokens by matching token
 * codes with a patience diff. Matched tokens are `retain` (using the target's
 * color), tokens only in `from` are `delete`, and tokens only in `to` are
 * `create`. Each token carries its `[col, line]` position on the relevant
 * side.
 */
export function diffStrings(from: string, to: string, language: string): MorphToken[] {
	const fromTokens = highlight(from, language);
	const toTokens = highlight(to, language);

	const fromCodes = fromTokens.map((t) => t.code);
	const toCodes = toTokens.map((t) => t.code);

	const diffResult = patienceDiff(fromCodes, toCodes);
	const fromMap = new Map<number, PositionedToken>();
	const toMap = new Map<number, PositionedToken>();
	for (let i = 0; i < fromTokens.length; i++) fromMap.set(i, fromTokens[i]);
	for (let i = 0; i < toTokens.length; i++) toMap.set(i, toTokens[i]);

	const morphTokens: MorphToken[] = [];

	for (const line of diffResult.lines) {
		if (line.aIndex >= 0 && line.bIndex >= 0) {
			const ft = fromMap.get(line.aIndex)!;
			const tt = toMap.get(line.bIndex)!;
			morphTokens.push({
				code: ft.code,
				color: tt.color,
				morph: 'retain',
				from: [ft.col, ft.line],
				to: [tt.col, tt.line]
			});
		} else if (line.aIndex >= 0 && line.bIndex < 0) {
			const ft = fromMap.get(line.aIndex)!;
			morphTokens.push({
				code: ft.code,
				color: ft.color,
				morph: 'delete',
				from: [ft.col, ft.line],
				to: null
			});
		} else if (line.aIndex < 0 && line.bIndex >= 0) {
			const tt = toMap.get(line.bIndex)!;
			morphTokens.push({
				code: tt.code,
				color: tt.color,
				morph: 'create',
				from: null,
				to: [tt.col, tt.line]
			});
		}
	}

	return morphTokens;
}
