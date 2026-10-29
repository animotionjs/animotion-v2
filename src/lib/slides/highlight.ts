export interface Token {
	text: string;
	color?: string;
}

export interface PositionedToken extends Token {
	color: string;
	line: number;
	col: number;
}

export interface MorphToken extends Token {
	color: string;
	morph: 'create' | 'delete' | 'retain';
	from: [number, number] | null;
	to: [number, number] | null;
}

const KEYWORDS = new Set([
	'as',
	'async',
	'await',
	'break',
	'case',
	'catch',
	'class',
	'const',
	'continue',
	'debugger',
	'default',
	'delete',
	'do',
	'else',
	'export',
	'extends',
	'false',
	'finally',
	'for',
	'from',
	'function',
	'get',
	'if',
	'implements',
	'import',
	'in',
	'instanceof',
	'interface',
	'let',
	'new',
	'null',
	'of',
	'return',
	'set',
	'static',
	'super',
	'switch',
	'this',
	'throw',
	'true',
	'try',
	'type',
	'typeof',
	'undefined',
	'var',
	'void',
	'while',
	'yield'
]);

const COLORS = {
	keyword: '#ffd54f',
	string: '#ffd54f',
	number: '#ffd54f',
	comment: '#71717a'
};

/**
 * Splits code into lines of colored tokens. This is deliberately small. It
 * covers comments, strings, numbers, and keywords, which is enough for slides.
 */
export function highlight(code: string, language = 'ts'): Token[][] {
	return code.split('\n').map((line) => highlightLine(line, language));
}

function highlightLine(line: string, language: string): Token[] {
	if (language === 'text' || language === 'plain') return [{ text: line }];

	const tokens: Token[] = [];
	let index = 0;

	while (index < line.length) {
		const rest = line.slice(index);
		const char = line.charAt(index);

		if (rest.startsWith('//')) {
			tokens.push({ text: rest, color: COLORS.comment });
			break;
		}

		if (char === '"' || char === "'" || char === '`') {
			let end = index + 1;
			while (end < line.length && line.charAt(end) !== char) {
				if (line.charAt(end) === '\\') end++;
				end++;
			}
			end = Math.min(end + 1, line.length);
			tokens.push({ text: line.slice(index, end), color: COLORS.string });
			index = end;
			continue;
		}

		if (/\d/.test(char)) {
			let end = index + 1;
			while (end < line.length && /[\d._]/.test(line.charAt(end))) end++;
			tokens.push({ text: line.slice(index, end), color: COLORS.number });
			index = end;
			continue;
		}

		if (/[A-Za-z_$]/.test(char)) {
			let end = index + 1;
			while (end < line.length && /[\w$]/.test(line.charAt(end))) end++;
			const word = line.slice(index, end);
			tokens.push({ text: word, color: KEYWORDS.has(word) ? COLORS.keyword : undefined });
			index = end;
			continue;
		}

		tokens.push({ text: char });
		index++;
	}

	return tokens;
}

/** Flattens the highlighted lines into tokens with 0-indexed line and column. */
export function positioned(code: string, language = 'ts'): PositionedToken[] {
	const tokens: PositionedToken[] = [];

	highlight(code, language).forEach((line, row) => {
		let col = 0;
		for (const token of line) {
			tokens.push({
				text: token.text,
				color: token.color ?? '',
				line: row,
				col
			});
			col += token.text.length;
		}
	});

	return tokens;
}

/**
 * Matches tokens from two code states. Retained tokens keep their source text
 * and remember both positions, deletes only have a source position, and
 * creates only have a target position.
 */
export function diffTokens(from: string, to: string, language = 'ts'): MorphToken[] {
	const source = positioned(from, language);
	const target = positioned(to, language);
	const pairs = longestCommonSubsequence(source, target);
	const tokens: MorphToken[] = [];
	let sourceIndex = 0;
	let targetIndex = 0;

	for (const [sourceMatch, targetMatch] of pairs) {
		while (sourceIndex < sourceMatch) {
			const token = source[sourceIndex];
			if (token) {
				tokens.push({
					text: token.text,
					color: token.color,
					morph: 'delete',
					from: [token.col, token.line],
					to: null
				});
			}
			sourceIndex++;
		}

		while (targetIndex < targetMatch) {
			const token = target[targetIndex];
			if (token) {
				tokens.push({
					text: token.text,
					color: token.color,
					morph: 'create',
					from: null,
					to: [token.col, token.line]
				});
			}
			targetIndex++;
		}

		const sourceToken = source[sourceMatch];
		const targetToken = target[targetMatch];
		if (sourceToken && targetToken) {
			tokens.push({
				text: targetToken.text,
				color: targetToken.color,
				morph: 'retain',
				from: [sourceToken.col, sourceToken.line],
				to: [targetToken.col, targetToken.line]
			});
		}

		sourceIndex = sourceMatch + 1;
		targetIndex = targetMatch + 1;
	}

	while (sourceIndex < source.length) {
		const token = source[sourceIndex];
		if (token) {
			tokens.push({
				text: token.text,
				color: token.color,
				morph: 'delete',
				from: [token.col, token.line],
				to: null
			});
		}
		sourceIndex++;
	}

	while (targetIndex < target.length) {
		const token = target[targetIndex];
		if (token) {
			tokens.push({
				text: token.text,
				color: token.color,
				morph: 'create',
				from: null,
				to: [token.col, token.line]
			});
		}
		targetIndex++;
	}

	return tokens;
}

function longestCommonSubsequence(
	source: PositionedToken[],
	target: PositionedToken[]
): Array<[number, number]> {
	const rows = source.length;
	const columns = target.length;
	const lengths = Array.from({ length: rows + 1 }, () => new Uint32Array(columns + 1));

	for (let row = rows - 1; row >= 0; row--) {
		for (let column = columns - 1; column >= 0; column--) {
			const current = lengths[row];
			const next = lengths[row + 1];
			if (!current || !next) continue;
			current[column] =
				source[row]?.text === target[column]?.text
					? (next[column + 1] ?? 0) + 1
					: Math.max(next[column] ?? 0, current[column + 1] ?? 0);
		}
	}

	const pairs: Array<[number, number]> = [];
	let row = 0;
	let column = 0;

	while (row < rows && column < columns) {
		if (source[row]?.text === target[column]?.text) {
			pairs.push([row, column]);
			row++;
			column++;
			continue;
		}

		const down = lengths[row + 1]?.[column] ?? 0;
		const right = lengths[row]?.[column + 1] ?? 0;
		if (down >= right) row++;
		else column++;
	}

	return pairs;
}

/** Turns `"2-4, 7"` into the set `{ 2, 3, 4, 7 }`. */
export function parseHighlight(value: string | undefined): Set<number> {
	const lines = new Set<number>();
	if (!value) return lines;

	for (const part of value.split(',')) {
		const [startText, endText] = part.trim().split('-');
		const start = Number(startText);
		if (!Number.isFinite(start)) continue;
		const end = Number.isFinite(Number(endText)) ? Number(endText) : start;
		for (let line = start; line <= end; line++) lines.add(line);
	}

	return lines;
}
