import { describe, expect, it } from 'vitest';
import { morphBounds, morphDigitCount } from './code-render.svelte';
import type { MorphToken } from './highlighter';

function token(partial: Partial<MorphToken>): MorphToken {
	return { code: '', color: '', morph: 'retain', from: null, to: null, ...partial };
}

describe('morphBounds', () => {
	const tokens: MorphToken[] = [
		token({ code: 'abcd', morph: 'retain', from: [2, 0], to: [4, 3] }),
		token({ code: 'xy', morph: 'delete', from: [0, 5], to: null }),
		token({ code: 'zzz', morph: 'create', from: null, to: [1, 1] })
	];

	it('returns the from-content bounds at progress 0', () => {
		expect(morphBounds(tokens, 0)).toEqual({ width: 6, height: 6 });
	});

	it('returns the to-content bounds at progress 1', () => {
		expect(morphBounds(tokens, 1)).toEqual({ width: 8, height: 4 });
	});

	it('lerps between from and to bounds over the normalized morph window', () => {
		const bounds = morphBounds(tokens, 0.5);
		expect(bounds.width).toBeCloseTo(7, 5);
		expect(bounds.height).toBeCloseTo(5, 5);
	});

	it('stays on the from bounds at the start of the morph window', () => {
		expect(morphBounds(tokens, 0)).toEqual({ width: 6, height: 6 });
	});

	it('sizes multi-line tokens by their last line', () => {
		const multi = [token({ code: 'aa\nbb', morph: 'create', from: null, to: [0, 0] })];
		expect(morphBounds(multi, 1)).toEqual({ width: 2, height: 2 });
	});

	it('handles morphs with only creates and only deletes', () => {
		const creates = [token({ code: 'abc', morph: 'create', from: null, to: [0, 0] })];
		const deletes = [token({ code: 'abc', morph: 'delete', from: [0, 0], to: null })];
		expect(morphBounds(creates, 0)).toEqual({ width: 0, height: 0 });
		expect(morphBounds(creates, 1)).toEqual({ width: 3, height: 1 });
		expect(morphBounds(deletes, 0)).toEqual({ width: 3, height: 1 });
		expect(morphBounds(deletes, 1)).toEqual({ width: 0, height: 0 });
	});

	it('reserves enough line-number digits for both morph sides', () => {
		const tokens = [token({ code: 'line', morph: 'retain', from: [0, 8], to: [0, 9] })];
		expect(morphDigitCount(tokens)).toBe(2);
	});
});
