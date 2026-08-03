import { beforeAll, describe, expect, it } from 'vitest';
import { diffStrings, highlight, registerLanguages, whenReady } from './highlighter';

beforeAll(async () => {
	await whenReady();
	await registerLanguages(['python', 'rust']);
});

describe('highlight', () => {
	it('produces positioned tokens with colors for the default language', () => {
		const tokens = highlight('const value: number = 1;', 'ts');
		expect(tokens.length).toBeGreaterThan(0);
		expect(tokens.some((t) => t.color.length > 0)).toBe(true);
		expect(tokens.every((t) => t.line === 0)).toBe(true);
	});

	it('tracks line and column across multiple lines', () => {
		const tokens = highlight('const a = 1;\nconst b = 2;', 'ts');
		const secondLine = tokens.filter((t) => t.line === 1);
		expect(secondLine.length).toBeGreaterThan(0);
		const cols = secondLine.map((t) => t.col);
		expect(cols[0]).toBe(0);
	});

	it('supports languages beyond the defaults', () => {
		const py = highlight('def greet():\n    print("hi")', 'python');
		expect(py.length).toBeGreaterThan(0);
		expect(py.some((t) => t.color.length > 0)).toBe(true);

		const rust = highlight('fn main() { println!("hi"); }', 'rust');
		expect(rust.length).toBeGreaterThan(0);
		expect(rust.some((t) => t.color.length > 0)).toBe(true);
	});

	it('returns no tokens for unknown languages', () => {
		expect(highlight('const x = 1;', 'nope')).toEqual([]);
	});
});

describe('diffStrings', () => {
	it('retains unchanged tokens and creates new ones', () => {
		const morphs = diffStrings('const a = 1;', 'const b = 2;', 'ts');
		expect(morphs.some((t) => t.morph === 'retain')).toBe(true);
		expect(morphs.some((t) => t.morph === 'create')).toBe(true);
		expect(morphs.some((t) => t.morph === 'delete')).toBe(true);
	});

	it('marks identical code entirely as retain', () => {
		const morphs = diffStrings('const a = 1;', 'const a = 1;', 'ts');
		expect(morphs.length).toBeGreaterThan(0);
		expect(morphs.every((t) => t.morph === 'retain')).toBe(true);
	});
});
