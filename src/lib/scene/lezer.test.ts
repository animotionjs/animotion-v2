import { parser as tsParser } from '@lezer/javascript';
import { describe, expect, it } from 'vitest';
import { getParser, highlight, registerLanguage, registerLanguages } from './lezer';

const tsxParser = tsParser.configure({ dialect: 'tsx' });

describe('language registry', () => {
	it('registers a new language and resolves it', () => {
		registerLanguage('tsx', tsxParser);
		expect(getParser('tsx')).toBe(tsxParser);
	});

	it('registerLanguages registers several names at once', () => {
		registerLanguages({ tsx: tsxParser, tsx2: tsxParser });
		expect(getParser('tsx2')).toBe(tsxParser);
	});

	it('registration makes highlight work for the new language', () => {
		registerLanguage('tsx', tsxParser);
		const tokens = highlight('const value: number = 1;', 'tsx');
		expect(tokens.length).toBeGreaterThan(0);
		expect(tokens.some((t) => t.classes.length > 0)).toBe(true);
	});

	it('allows overriding built-ins', () => {
		registerLanguage('ts', tsxParser);
		expect(getParser('ts')).toBe(tsxParser);
	});

	it('throws for unknown languages', () => {
		expect(() => getParser('nope')).toThrowError('No Lezer parser for language: nope');
	});
});
