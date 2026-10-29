import { describe, expect, it } from 'vitest';
import { computeMorphSpans, computeSettledSpans, morphBounds } from './code-render.js';
import { diffTokens, parseHighlight, positioned } from './highlight.js';

describe('code morph', () => {
	it('retains shared tokens and creates new ones', () => {
		const tokens = diffTokens('let count = 0;', 'let count = $state(0);');

		expect(tokens.some((token) => token.morph === 'retain' && token.text === 'count')).toBe(true);
		expect(tokens.some((token) => token.morph === 'create' && token.text === '$state')).toBe(true);
		expect(tokens.some((token) => token.morph === 'delete')).toBe(false);
	});

	it('moves retained tokens between their two positions', () => {
		const tokens = diffTokens('let count = 0;', 'let count = $state(0);');
		const spans = computeMorphSpans(tokens, 0.5, new Set(), new Set(), 0.32);
		const zero = spans.find((span) => span.text === '0');

		expect(zero).toBeDefined();
		expect(zero?.leftCh).toBeGreaterThan(12);
		expect(zero?.leftCh).toBeLessThan(17);
	});

	it('fades creates in and deletes out', () => {
		const tokens = diffTokens('let count = 0;', 'let count = $state(0);');
		const start = computeMorphSpans(tokens, 0, new Set(), new Set(), 0.32);
		const end = computeMorphSpans(tokens, 1, new Set(), new Set(), 0.32);

		expect(start.some((span) => span.text === '$state')).toBe(false);
		expect(end.some((span) => span.text === '$state' && span.alpha === 1)).toBe(true);
	});

	it('builds settled spans from positioned tokens', () => {
		const spans = computeSettledSpans(positioned('let count = $state(0);'), new Set(), 0.32);

		expect(spans.map((span) => span.text).join('')).toBe('let count = $state(0);');
		expect(spans.every((span) => span.alpha === 1)).toBe(true);
	});

	it('dims lines outside the highlight', () => {
		const spans = computeSettledSpans(positioned('a\nb'), new Set([2]), 0.32);

		expect(spans.find((span) => span.text === 'a')?.alpha).toBe(0.32);
		expect(spans.find((span) => span.text === 'b')?.alpha).toBe(1);
	});

	it('tweens highlight opacity during a morph', () => {
		const tokens = diffTokens('a\nb', 'a\nb');
		const spans = computeMorphSpans(tokens, 0.5, new Set([2]), new Set([1]), 0.32);

		expect(spans.find((span) => span.text === 'a')?.alpha).toBeCloseTo(0.66);
		expect(spans.find((span) => span.text === 'b')?.alpha).toBeCloseTo(0.66);
	});

	it('keeps a moving token selected from its old line to its new line', () => {
		const tokens = diffTokens('a\nb', 'x\na\nb');
		const spans = computeMorphSpans(tokens, 0, new Set([2]), new Set([1]), 0.32);

		expect(spans.find((span) => span.text === 'a')?.alpha).toBe(1);
	});

	it('keeps the morph width wide enough for both sides', () => {
		const tokens = diffTokens('let count = 0;', 'let count = $state(0);\nlet double = 0;');
		const start = morphBounds(tokens, 0);
		const mid = morphBounds(tokens, 0.5);
		const end = morphBounds(tokens, 1);

		expect(mid.width).toBe(start.width);
		expect(mid.width).toBe(end.width);
		expect(end.height).toBeGreaterThan(start.height);
	});
});

describe('highlight parsing', () => {
	it('reads line numbers and ranges', () => {
		expect([...parseHighlight('2-4, 7')]).toEqual([2, 3, 4, 7]);
	});

	it('treats an empty value as no selection', () => {
		expect(parseHighlight(undefined).size).toBe(0);
	});
});
