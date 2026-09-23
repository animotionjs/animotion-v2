import { describe, expect, it } from 'vitest';
import { configure, diffStrings, highlight } from './highlighter';
import { registerTestLanguages } from './test-languages';

registerTestLanguages();

describe('highlight', () => {
	it('produces positioned tokens with colors for the default language', () => {
		const tokens = highlight('const value: number = 1;', 'typescript');
		expect(tokens.length).toBeGreaterThan(0);
		expect(tokens.some((t) => t.color.length > 0)).toBe(true);
		expect(tokens.every((t) => t.line === 0)).toBe(true);
	});

	it('tracks line and column across multiple lines', () => {
		const tokens = highlight('const a = 1;\nconst b = 2;', 'typescript');
		const secondLine = tokens.filter((t) => t.line === 1);
		expect(secondLine.length).toBeGreaterThan(0);
		const cols = secondLine.map((t) => t.col);
		expect(cols[0]).toBe(0);
	});

	it('tokens match the source exactly', () => {
		const code = 'const value: number = 1;\n// comment\nconst text = "hi";';
		const tokens = highlight(code, 'typescript');
		expect(tokens.length).toBeGreaterThan(0);
		const lineStarts = [0];
		for (let i = 0; i < code.length; i++) {
			if (code[i] === '\n') lineStarts.push(i + 1);
		}
		let cursor = 0;
		for (const token of tokens) {
			let offset = lineStarts[token.line] + token.col;
			// newlines live between lines rather than inside tokens
			if (offset === cursor + 1) {
				expect(code[cursor]).toBe('\n');
				cursor++;
				offset = lineStarts[token.line] + token.col;
			}
			expect(offset).toBe(cursor);
			expect(code.slice(offset, offset + token.code.length)).toBe(token.code);
			cursor = offset + token.code.length;
		}
		expect(cursor).toBe(code.length);
	});

	it('returns no tokens for languages that are not installed', () => {
		expect(highlight('<h1>hi</h1>', 'svelte')).toEqual([]);
	});

	it('returns no tokens for unknown languages', () => {
		expect(highlight('const x = 1;', 'nope')).toEqual([]);
	});

	it('registers languages through configure', () => {
		expect(highlight('hi there', 'stubbed')).toEqual([]);
		configure({
			languages: {
				stubbed: () => (code: string) => {
					const end = code.indexOf(' ');
					return { tokens: new Uint32Array([0, 0, end]), token_types: ['keyword'] };
				}
			}
		});
		const tokens = highlight('hi there', 'stubbed');
		expect(tokens.length).toBeGreaterThan(0);
		expect(tokens[0].code).toBe('hi');
	});
});

describe('configure', () => {
	it('switches the active theme', () => {
		configure({ theme: 'animotion-dark' });
		const [dark] = highlight('const x = 1;', 'typescript');
		configure({ theme: 'animotion-light' });
		const [light] = highlight('const x = 1;', 'typescript');
		expect(dark.color).not.toBe(light.color);
	});
});

describe('diffStrings', () => {
	it('retains unchanged tokens and creates new ones', () => {
		const morphs = diffStrings('const a = 1;', 'const b = 2;', 'typescript');
		expect(morphs.some((t) => t.morph === 'retain')).toBe(true);
		expect(morphs.some((t) => t.morph === 'create')).toBe(true);
		expect(morphs.some((t) => t.morph === 'delete')).toBe(true);
	});

	it('marks identical code entirely as retain', () => {
		const morphs = diffStrings('const a = 1;', 'const a = 1;', 'typescript');
		expect(morphs.length).toBeGreaterThan(0);
		expect(morphs.every((t) => t.morph === 'retain')).toBe(true);
	});
});
