import { describe, expect, it } from 'vitest';
import {
	DEFAULT_VOICEOVER_FILTERS,
	OBS_EXPANDER_PRESETS,
	cloneVoiceoverFilters,
	dbToGain,
	validateVoiceoverFilterFile,
	validateVoiceoverFilters
} from './filters.js';

describe('voiceover filter defaults', () => {
	it('mirrors the OBS mic chain', () => {
		expect(DEFAULT_VOICEOVER_FILTERS).toEqual({
			noiseSuppression: { enabled: true },
			gain: { enabled: true, db: 10 },
			eq: { enabled: true, low: 2, mid: 0, high: 0 },
			expander: {
				enabled: true,
				preset: 'expander',
				threshold: -30,
				ratio: 2,
				attack: 10,
				release: 50,
				outputGain: 10,
				detector: 'rms'
			},
			compressor: {
				enabled: true,
				threshold: -18.4,
				ratio: 3,
				attack: 2,
				release: 100,
				outputGain: 0
			},
			limiter: { enabled: true, threshold: -0.1, release: 60 }
		});
	});

	it('carries the OBS expander presets', () => {
		expect(OBS_EXPANDER_PRESETS.expander).toEqual({
			threshold: -40,
			ratio: 2,
			attack: 10,
			release: 50,
			outputGain: 0
		});
		expect(OBS_EXPANDER_PRESETS.gate.ratio).toBe(10);
		expect(OBS_EXPANDER_PRESETS.gate.release).toBe(125);
	});
});

describe('validateVoiceoverFilters', () => {
	it('accepts the defaults', () => {
		expect(validateVoiceoverFilters(DEFAULT_VOICEOVER_FILTERS)).toEqual(DEFAULT_VOICEOVER_FILTERS);
	});

	it('rejects a missing section and a bad toggle', () => {
		const { gain, ...rest } = DEFAULT_VOICEOVER_FILTERS;
		expect(() => validateVoiceoverFilters(rest)).toThrow(RangeError);
		expect(() =>
			validateVoiceoverFilters({ ...DEFAULT_VOICEOVER_FILTERS, gain: { ...gain, enabled: 'yes' } })
		).toThrow(RangeError);
	});

	it('rejects an unknown expander preset or detector', () => {
		expect(() =>
			validateVoiceoverFilters({
				...DEFAULT_VOICEOVER_FILTERS,
				expander: { ...DEFAULT_VOICEOVER_FILTERS.expander, preset: 'squash' }
			})
		).toThrow(/preset/);
		expect(() =>
			validateVoiceoverFilters({
				...DEFAULT_VOICEOVER_FILTERS,
				expander: { ...DEFAULT_VOICEOVER_FILTERS.expander, detector: 'average' }
			})
		).toThrow(/detector/);
	});

	it('rejects values outside the OBS bounds', () => {
		expect(() =>
			validateVoiceoverFilters({
				...DEFAULT_VOICEOVER_FILTERS,
				gain: { enabled: true, db: 60 }
			})
		).toThrow(/gain/);
		expect(() =>
			validateVoiceoverFilters({
				...DEFAULT_VOICEOVER_FILTERS,
				limiter: { enabled: true, threshold: 5, release: 60 }
			})
		).toThrow(/limiter/);
		expect(() =>
			validateVoiceoverFilters({
				...DEFAULT_VOICEOVER_FILTERS,
				compressor: { ...DEFAULT_VOICEOVER_FILTERS.compressor, ratio: 99 }
			})
		).toThrow(/compressor/);
		expect(() =>
			validateVoiceoverFilters({
				...DEFAULT_VOICEOVER_FILTERS,
				compressor: { ...DEFAULT_VOICEOVER_FILTERS.compressor, attack: 900 }
			})
		).toThrow(/compressor/);
		expect(() =>
			validateVoiceoverFilters({
				...DEFAULT_VOICEOVER_FILTERS,
				expander: { ...DEFAULT_VOICEOVER_FILTERS.expander, attack: 500 }
			})
		).toThrow(/expander/);
	});

	it('rejects non finite numbers so a poisoned value never reaches a node', () => {
		for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
			expect(() =>
				validateVoiceoverFilters({
					...DEFAULT_VOICEOVER_FILTERS,
					gain: { enabled: true, db: bad }
				})
			).toThrow(RangeError);
		}
	});

	it('drops unknown fields instead of passing them through', () => {
		const filters = validateVoiceoverFilters({
			...DEFAULT_VOICEOVER_FILTERS,
			gain: { enabled: true, db: 5, sneaky: true },
			__proto__: { polluted: true }
		});
		expect(filters.gain).toEqual({ enabled: true, db: 5 });
		expect(Object.keys(filters.gain)).toEqual(['enabled', 'db']);
		expect(Object.prototype).not.toHaveProperty('polluted');
	});
});

describe('validateVoiceoverFilterFile', () => {
	it('accepts a project file', () => {
		const file = validateVoiceoverFilterFile({
			version: 1,
			project: 'example',
			filters: DEFAULT_VOICEOVER_FILTERS
		});
		expect(file.project).toBe('example');
		expect(file.filters.gain.db).toBe(10);
	});

	it('rejects a bad version and a bad slug', () => {
		expect(() =>
			validateVoiceoverFilterFile({
				version: 2,
				project: 'example',
				filters: DEFAULT_VOICEOVER_FILTERS
			})
		).toThrow(RangeError);
		expect(() =>
			validateVoiceoverFilterFile({
				version: 1,
				project: '../escape',
				filters: DEFAULT_VOICEOVER_FILTERS
			})
		).toThrow(RangeError);
	});
});

describe('dbToGain', () => {
	it('maps decibels to linear gain', () => {
		expect(dbToGain(0)).toBe(1);
		expect(dbToGain(10)).toBeCloseTo(3.1623, 3);
		expect(dbToGain(-6)).toBeCloseTo(0.5012, 3);
	});
});

describe('cloneVoiceoverFilters', () => {
	it('copies nested sections', () => {
		const clone = cloneVoiceoverFilters(DEFAULT_VOICEOVER_FILTERS);
		clone.gain.db = 0;
		clone.expander.preset = 'gate';
		clone.limiter.release = 100;
		expect(DEFAULT_VOICEOVER_FILTERS.gain.db).toBe(10);
		expect(DEFAULT_VOICEOVER_FILTERS.expander.preset).toBe('expander');
		expect(DEFAULT_VOICEOVER_FILTERS.limiter.release).toBe(60);
	});
});
