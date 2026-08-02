import { describe, expect, it } from 'vitest';
import { resolveScenes } from './scenes';

const ALL = ['intro', 'about', 'code', 'layout', 'tick', 'radius'];

describe('resolveScenes', () => {
	it('passes through exact scene ids', () => {
		expect(resolveScenes(['intro', 'tick'], ALL)).toEqual(['intro', 'tick']);
	});

	it('strips a number prefix from file-style names', () => {
		expect(resolveScenes(['01-intro', '05-tick'], ALL)).toEqual(['intro', 'tick']);
	});

	it('preserves order and removes duplicates', () => {
		expect(resolveScenes(['tick', 'intro', '05-tick'], ALL)).toEqual(['tick', 'intro']);
	});

	it('throws on an unknown scene with the available ids', () => {
		expect(() => resolveScenes(['intro', 'missing'], ALL)).toThrow(
			'Unknown scene "missing". Available scenes: intro, about, code, layout, tick, radius'
		);
	});
});
