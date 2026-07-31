import { parser as rustParser } from '@lezer/rust';
import { describe, expect, it } from 'vitest';
import { getParser, highlight, registerLanguage, registerLanguages } from './lezer';

describe('language registry', () => {
	it('registers a new language and resolves it', () => {
		registerLanguage('rust', rustParser);
		expect(getParser('rust')).toBe(rustParser);
	});

	it('registerLanguages registers several names at once', () => {
		registerLanguages({ rust: rustParser, rust2: rustParser });
		expect(getParser('rust2')).toBe(rustParser);
	});

	it('registration makes highlight work for the new language', () => {
		registerLanguage('rust', rustParser);
		const tokens = highlight('fn main() {}', 'rust');
		expect(tokens.length).toBeGreaterThan(0);
		expect(tokens.some((t) => t.classes.length > 0)).toBe(true);
	});

	it('allows overriding built-ins', () => {
		registerLanguage('ts', rustParser);
		expect(getParser('ts')).toBe(rustParser);
	});

	it('throws for unknown languages', () => {
		expect(() => getParser('nope')).toThrowError('No Lezer parser for language: nope');
	});
});
