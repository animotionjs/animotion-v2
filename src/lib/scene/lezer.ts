import { classHighlighter, highlightCode } from '@lezer/highlight';
import { parser as tsParser } from '@lezer/javascript';
import type { LRParser } from '@lezer/lr';

const parsers = new Map<string, LRParser>();

parsers.set('ts', tsParser.configure({ dialect: 'ts' }));
parsers.set('js', tsParser);

export function registerLanguage(language: string, parser: LRParser) {
	parsers.set(language, parser);
}

export function registerLanguages(languages: Record<string, LRParser>) {
	for (const [name, parser] of Object.entries(languages)) parsers.set(name, parser);
}

export function getParser(language: string): LRParser {
	const p = parsers.get(language);
	if (p) return p;
	throw new Error(`No Lezer parser for language: ${language}`);
}

const highlighter = classHighlighter;

export interface Token {
	code: string;
	classes: string;
}

export interface PositionedToken extends Token {
	line: number;
	col: number;
}

export interface MorphToken extends Token {
	morph: 'create' | 'delete' | 'retain';
	from: [number, number] | null;
	to: [number, number] | null;
}

type Subsequence = {
	aIndex: number;
	bIndex: number;
	prev?: Subsequence;
};

type DiffLine = { line: string; aIndex: number; bIndex: number; moved: boolean };

export function highlight(code: string, language: string): PositionedToken[] {
	const parser = getParser(language);
	const tree = parser.parse(code);
	const tokens: PositionedToken[] = [];
	let line = 0;
	let col = 0;

	function flush(text: string, classes: string) {
		if (text.length === 0) return;
		tokens.push({ code: text, classes, line, col });
		col += text.length;
	}

	highlightCode(
		code,
		tree,
		highlighter,
		(text, classes) => {
			flush(text, classes ?? '');
		},
		() => {
			line++;
			col = 0;
		}
	);

	return tokens;
}

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
				classes: tt.classes,
				morph: 'retain',
				from: [ft.col, ft.line],
				to: [tt.col, tt.line]
			});
		} else if (line.aIndex >= 0 && line.bIndex < 0) {
			const ft = fromMap.get(line.aIndex)!;
			morphTokens.push({
				code: ft.code,
				classes: ft.classes,
				morph: 'delete',
				from: [ft.col, ft.line],
				to: null
			});
		} else if (line.aIndex < 0 && line.bIndex >= 0) {
			const tt = toMap.get(line.bIndex)!;
			morphTokens.push({
				code: tt.code,
				classes: tt.classes,
				morph: 'create',
				from: null,
				to: [tt.col, tt.line]
			});
		}
	}

	return morphTokens;
}
