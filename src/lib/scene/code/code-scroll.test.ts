import { describe, expect, it } from 'vitest';
import {
	computeIdleTarget,
	computeRevealTarget,
	computeSelectionTarget,
	fadeMaskImage,
	revealTargetLine,
	scrollMask
} from './code-scroll';
import type { CodeRange } from './code.svelte';
import type { MorphToken } from './highlighter';

function token(morph: MorphToken['morph'], code: string, to: [number, number] | null): MorphToken {
	return { morph, code, color: '', from: null, to };
}

describe('code scroll helpers', () => {
	it('finds the bottom of newly created multiline content', () => {
		expect(revealTargetLine([token('create', 'a\nb\nc', [0, 3])])).toBe(6);
		expect(revealTargetLine([token('retain', 'x', [0, 8])])).toBeNull();
	});

	it('reveals created content below the safe viewport', () => {
		expect(computeRevealTarget(30, 20, 100, 1000, 10, 0)).toBe(510);
		expect(computeRevealTarget(3, 20, 100, 1000, 10, 0)).toBeNull();
	});

	it('scrolls selections up or down with a safe fade margin', () => {
		const below: CodeRange[] = [
			[
				[8, 0],
				[8, Infinity]
			]
		];
		const above: CodeRange[] = [
			[
				[1, 0],
				[1, Infinity]
			]
		];
		expect(computeSelectionTarget(below, 20, 20, 100, 1000, 10, 0)).toBe(90);
		expect(computeSelectionTarget(above, 20, 20, 100, 1000, 10, 100)).toBe(10);
	});

	it('does not scroll all-lines or already visible selections', () => {
		const all: CodeRange[] = [
			[
				[0, 0],
				[Infinity, Infinity]
			]
		];
		const visible: CodeRange[] = [
			[
				[1, 0],
				[2, Infinity]
			]
		];
		expect(computeSelectionTarget(all, 10, 20, 100, 1000, 10, 0)).toBeNull();
		expect(computeSelectionTarget(visible, 10, 20, 100, 1000, 10, 0)).toBeNull();
	});

	it('parks an empty selection at the top of the code', () => {
		expect(computeIdleTarget([], 20, 20, 100, 1000, 10)).toBe(0);
	});

	it('measures idle targets from the top so rewinds climb back up', () => {
		const below: CodeRange[] = [
			[
				[8, 0],
				[8, Infinity]
			]
		];
		expect(computeIdleTarget(below, 20, 20, 100, 1000, 10)).toBe(90);
	});

	it('keeps the current scroll for idle all-lines selections', () => {
		const all: CodeRange[] = [
			[
				[0, 0],
				[Infinity, Infinity]
			]
		];
		expect(computeIdleTarget(all, 10, 20, 100, 1000, 10)).toBeNull();
	});

	it('reports the correct mask at each scroll edge', () => {
		expect(scrollMask(0, 100, 100)).toBe('none');
		expect(scrollMask(0, 100, 300)).toBe('bottom');
		expect(scrollMask(100, 100, 300)).toBe('both');
		expect(scrollMask(200, 100, 300)).toBe('top');
	});
});

describe('fadeMaskImage', () => {
	it('returns an empty string when there is no mask or size', () => {
		expect(fadeMaskImage('none', 2)).toBe('');
		expect(fadeMaskImage('top', 0)).toBe('');
	});

	it('fades the top edge with eased oklch stops', () => {
		const image = fadeMaskImage('top', 2);
		const stops = image.slice('linear-gradient(to bottom, '.length, -1);
		expect(image.startsWith('linear-gradient(to bottom, ')).toBe(true);
		expect(stops.startsWith('oklch(0 0 0 / 0) 0')).toBe(true);
		expect(stops.endsWith('oklch(0 0 0 / 1) 2em')).toBe(true);
		expect(image).toContain('oklch(0 0 0 / ');
	});

	it('fades the bottom edge, opaque first', () => {
		const image = fadeMaskImage('bottom', 2);
		const stops = image.slice('linear-gradient(to bottom, '.length, -1);
		expect(stops.startsWith('oklch(0 0 0 / 1) calc(100% - 2em)')).toBe(true);
		expect(stops.endsWith('oklch(0 0 0 / 0) 100%')).toBe(true);
	});

	it('fades both edges with an opaque middle', () => {
		const image = fadeMaskImage('both', 2);
		expect(image).toContain('oklch(0 0 0 / 1) 2em');
		expect(image).toContain('oklch(0 0 0 / 1) calc(100% - 2em)');
		expect(image).toContain('oklch(0 0 0 / 0) 100%');
	});

	it('produces strictly increasing alpha for the top edge', () => {
		const image = fadeMaskImage('top', 2);
		const alphas = [...image.matchAll(/oklch\(0 0 0 \/ ([\d.]+)\)/g)].map((m) => Number(m[1]));
		for (let i = 1; i < alphas.length; i++) {
			expect(alphas[i]).toBeGreaterThanOrEqual(alphas[i - 1]);
		}
		expect(alphas[0]).toBe(0);
		expect(alphas.at(-1)).toBe(1);
	});
});
