import { validateProject } from './types.ts';

export interface NoiseSuppressionSettings {
	enabled: boolean;
}

export interface GainSettings {
	enabled: boolean;
	db: number;
}

export interface EqSettings {
	enabled: boolean;
	low: number;
	mid: number;
	high: number;
}

/** OBS ships two expander presets that only change the starting values */
export type ExpanderPreset = 'expander' | 'gate';
export type ExpanderDetector = 'rms' | 'peak';

export interface ExpanderSettings {
	enabled: boolean;
	preset: ExpanderPreset;
	threshold: number;
	ratio: number;
	attack: number;
	release: number;
	outputGain: number;
	detector: ExpanderDetector;
}

export interface CompressorSettings {
	enabled: boolean;
	threshold: number;
	ratio: number;
	attack: number;
	release: number;
	outputGain: number;
}

export interface LimiterSettings {
	enabled: boolean;
	threshold: number;
	release: number;
}

export interface VoiceoverFilterSettings {
	noiseSuppression: NoiseSuppressionSettings;
	gain: GainSettings;
	eq: EqSettings;
	expander: ExpanderSettings;
	compressor: CompressorSettings;
	limiter: LimiterSettings;
}

export interface VoiceoverFilterFile {
	version: 1;
	project: string;
	filters: VoiceoverFilterSettings;
}

/*
 * Defaults mirror the OBS mic chain in use, so a fresh project starts
 * where the existing setup already sounds right. The expander and limiter
 * carry the OBS defaults for the fields the saved chain left unset.
 */
export const DEFAULT_VOICEOVER_FILTERS: VoiceoverFilterSettings = {
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
	compressor: { enabled: true, threshold: -18.4, ratio: 3, attack: 2, release: 100, outputGain: 0 },
	limiter: { enabled: true, threshold: -0.1, release: 60 }
};

/*
 * Values OBS writes when an expander preset is chosen. Picking one replaces
 * the four shaping controls, exactly like the OBS preset button does.
 */
export const OBS_EXPANDER_PRESETS: Record<
	ExpanderPreset,
	{ threshold: number; ratio: number; attack: number; release: number; outputGain: number }
> = {
	expander: { threshold: -40, ratio: 2, attack: 10, release: 50, outputGain: 0 },
	gate: { threshold: -40, ratio: 10, attack: 10, release: 125, outputGain: 0 }
};

interface Range {
	min: number;
	max: number;
	step: number;
}

/* Slider bounds, taken from the OBS filter properties */
export const VOICEOVER_FILTER_RANGES: {
	gainDb: Range;
	eqBand: Range;
	threshold: Range;
	expanderRatio: Range;
	compressorRatio: Range;
	expanderAttackMs: Range;
	expanderReleaseMs: Range;
	compressorAttackMs: Range;
	compressorReleaseMs: Range;
	outputGainDb: Range;
	limiterThreshold: Range;
	limiterReleaseMs: Range;
} = {
	gainDb: { min: -30, max: 30, step: 0.1 },
	eqBand: { min: -20, max: 20, step: 0.1 },
	threshold: { min: -60, max: 0, step: 0.1 },
	expanderRatio: { min: 1, max: 20, step: 0.1 },
	compressorRatio: { min: 1, max: 32, step: 0.1 },
	expanderAttackMs: { min: 1, max: 100, step: 1 },
	expanderReleaseMs: { min: 1, max: 1000, step: 1 },
	compressorAttackMs: { min: 1, max: 500, step: 1 },
	compressorReleaseMs: { min: 1, max: 1000, step: 1 },
	outputGainDb: { min: -32, max: 32, step: 0.1 },
	limiterThreshold: { min: -60, max: 0, step: 0.1 },
	limiterReleaseMs: { min: 1, max: 1000, step: 1 }
};

/* Decibels to linear gain, matching OBS db_to_mul */
export function dbToGain(db: number): number {
	return Math.pow(10, db / 20);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function checkEnabled(input: Record<string, unknown>, name: string): boolean {
	if (typeof input.enabled !== 'boolean')
		throw new RangeError(`Voiceover ${name} enabled is invalid`);
	return input.enabled;
}

function checkNumber(
	input: Record<string, unknown>,
	field: string,
	name: string,
	min: number,
	max: number
): number {
	const value = input[field];
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
		throw new RangeError(`Voiceover ${name} ${field} is invalid`);
	}
	return value;
}

function checkChoice<T extends string>(
	input: Record<string, unknown>,
	field: string,
	name: string,
	allowed: readonly T[]
): T {
	const value = input[field];
	if (typeof value !== 'string' || !allowed.includes(value as T)) {
		throw new RangeError(`Voiceover ${name} ${field} is invalid`);
	}
	return value as T;
}

function validateNoiseSuppression(value: unknown): NoiseSuppressionSettings {
	if (!isRecord(value)) throw new RangeError('Voiceover noise suppression is invalid');
	return { enabled: checkEnabled(value, 'noise suppression') };
}

function validateGain(value: unknown): GainSettings {
	if (!isRecord(value)) throw new RangeError('Voiceover gain is invalid');
	const range = VOICEOVER_FILTER_RANGES.gainDb;
	return {
		enabled: checkEnabled(value, 'gain'),
		db: checkNumber(value, 'db', 'gain', range.min, range.max)
	};
}

function validateEq(value: unknown): EqSettings {
	if (!isRecord(value)) throw new RangeError('Voiceover equalizer is invalid');
	const range = VOICEOVER_FILTER_RANGES.eqBand;
	return {
		enabled: checkEnabled(value, 'equalizer'),
		low: checkNumber(value, 'low', 'equalizer', range.min, range.max),
		mid: checkNumber(value, 'mid', 'equalizer', range.min, range.max),
		high: checkNumber(value, 'high', 'equalizer', range.min, range.max)
	};
}

function validateExpander(value: unknown): ExpanderSettings {
	if (!isRecord(value)) throw new RangeError('Voiceover expander is invalid');
	const ranges = VOICEOVER_FILTER_RANGES;
	return {
		enabled: checkEnabled(value, 'expander'),
		preset: checkChoice(value, 'preset', 'expander', ['expander', 'gate'] as const),
		threshold: checkNumber(
			value,
			'threshold',
			'expander',
			ranges.threshold.min,
			ranges.threshold.max
		),
		ratio: checkNumber(
			value,
			'ratio',
			'expander',
			ranges.expanderRatio.min,
			ranges.expanderRatio.max
		),
		attack: checkNumber(
			value,
			'attack',
			'expander',
			ranges.expanderAttackMs.min,
			ranges.expanderAttackMs.max
		),
		release: checkNumber(
			value,
			'release',
			'expander',
			ranges.expanderReleaseMs.min,
			ranges.expanderReleaseMs.max
		),
		outputGain: checkNumber(
			value,
			'outputGain',
			'expander',
			ranges.outputGainDb.min,
			ranges.outputGainDb.max
		),
		detector: checkChoice(value, 'detector', 'expander', ['rms', 'peak'] as const)
	};
}

function validateCompressor(value: unknown): CompressorSettings {
	if (!isRecord(value)) throw new RangeError('Voiceover compressor is invalid');
	const ranges = VOICEOVER_FILTER_RANGES;
	return {
		enabled: checkEnabled(value, 'compressor'),
		threshold: checkNumber(
			value,
			'threshold',
			'compressor',
			ranges.threshold.min,
			ranges.threshold.max
		),
		ratio: checkNumber(
			value,
			'ratio',
			'compressor',
			ranges.compressorRatio.min,
			ranges.compressorRatio.max
		),
		attack: checkNumber(
			value,
			'attack',
			'compressor',
			ranges.compressorAttackMs.min,
			ranges.compressorAttackMs.max
		),
		release: checkNumber(
			value,
			'release',
			'compressor',
			ranges.compressorReleaseMs.min,
			ranges.compressorReleaseMs.max
		),
		outputGain: checkNumber(
			value,
			'outputGain',
			'compressor',
			ranges.outputGainDb.min,
			ranges.outputGainDb.max
		)
	};
}

function validateLimiter(value: unknown): LimiterSettings {
	if (!isRecord(value)) throw new RangeError('Voiceover limiter is invalid');
	const ranges = VOICEOVER_FILTER_RANGES;
	return {
		enabled: checkEnabled(value, 'limiter'),
		threshold: checkNumber(
			value,
			'threshold',
			'limiter',
			ranges.limiterThreshold.min,
			ranges.limiterThreshold.max
		),
		release: checkNumber(
			value,
			'release',
			'limiter',
			ranges.limiterReleaseMs.min,
			ranges.limiterReleaseMs.max
		)
	};
}

export function validateVoiceoverFilters(value: unknown): VoiceoverFilterSettings {
	if (!isRecord(value)) throw new RangeError('Voiceover filters are invalid');
	if (!isRecord(value.noiseSuppression))
		throw new RangeError('Voiceover noise suppression is invalid');
	if (!isRecord(value.gain)) throw new RangeError('Voiceover gain is invalid');
	if (!isRecord(value.eq)) throw new RangeError('Voiceover equalizer is invalid');
	if (!isRecord(value.expander)) throw new RangeError('Voiceover expander is invalid');
	if (!isRecord(value.compressor)) throw new RangeError('Voiceover compressor is invalid');
	if (!isRecord(value.limiter)) throw new RangeError('Voiceover limiter is invalid');
	return {
		noiseSuppression: validateNoiseSuppression(value.noiseSuppression),
		gain: validateGain(value.gain),
		eq: validateEq(value.eq),
		expander: validateExpander(value.expander),
		compressor: validateCompressor(value.compressor),
		limiter: validateLimiter(value.limiter)
	};
}

export function validateVoiceoverFilterFile(value: unknown): VoiceoverFilterFile {
	if (!isRecord(value)) throw new RangeError('Voiceover filter file is invalid');
	if (value.version !== 1) throw new RangeError('Voiceover filter version is unsupported');
	if (typeof value.project !== 'string')
		throw new RangeError('Voiceover filter project is invalid');
	validateProject(value.project);
	if (!isRecord(value.filters)) throw new RangeError('Voiceover filters are invalid');
	return {
		version: 1,
		project: value.project,
		filters: validateVoiceoverFilters(value.filters)
	};
}

export function cloneVoiceoverFilters(settings: VoiceoverFilterSettings): VoiceoverFilterSettings {
	return {
		noiseSuppression: { ...settings.noiseSuppression },
		gain: { ...settings.gain },
		eq: { ...settings.eq },
		expander: { ...settings.expander },
		compressor: { ...settings.compressor },
		limiter: { ...settings.limiter }
	};
}
