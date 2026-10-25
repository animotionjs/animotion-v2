import { describe, expect, it } from 'vitest';
import {
	VOICEOVER_EQ_HIGH_HZ,
	VOICEOVER_EQ_LOW_HZ,
	VOICEOVER_LIMITER_ATTACK_SECONDS,
	compressorGainDb,
	compressorSlope,
	eqCoefficient,
	expanderGainDb,
	expanderSlope,
	gainCoefficient,
	rmsCoefficient
} from './worklet.js';

const RATE = 48000;

describe('eqCoefficient', () => {
	it('matches the OBS one pole coefficient at 800 and 5000 Hz', () => {
		expect(eqCoefficient(VOICEOVER_EQ_LOW_HZ, RATE)).toBeCloseTo(
			2 * Math.sin((Math.PI * 800) / RATE),
			10
		);
		expect(eqCoefficient(VOICEOVER_EQ_HIGH_HZ, RATE)).toBeCloseTo(
			2 * Math.sin((Math.PI * 5000) / RATE),
			10
		);
	});
});

describe('gainCoefficient', () => {
	it('matches the OBS attack and release times', () => {
		// the compressor attack in the OBS chain is 2 ms
		expect(gainCoefficient(RATE, 0.002)).toBeCloseTo(Math.exp(-1 / (RATE * 0.002)), 10);
	});
});

describe('rmsCoefficient', () => {
	it('matches the OBS ten millisecond window', () => {
		expect(rmsCoefficient(RATE)).toBeCloseTo(Math.pow(2, -100 / RATE), 10);
	});
});

describe('expanderSlope', () => {
	it('is negative for a ratio above one', () => {
		expect(expanderSlope(2)).toBe(-1);
		expect(expanderSlope(1)).toBe(0);
	});
});

describe('compressorSlope', () => {
	it('is one minus the reciprocal of the ratio', () => {
		expect(compressorSlope(3)).toBeCloseTo(1 - 1 / 3, 10);
		expect(compressorSlope(1)).toBe(0);
	});
});

describe('expanderGainDb', () => {
	it('leaves levels at or above threshold alone', () => {
		expect(expanderGainDb(-30, -30, -1)).toBe(0);
		expect(expanderGainDb(-20, -30, -1)).toBe(0);
	});

	it('pushes quiet levels down by the ratio', () => {
		expect(expanderGainDb(-40, -30, -1)).toBe(-10);
	});

	it('clamps the reduction at 60 dB like OBS', () => {
		expect(expanderGainDb(-200, -30, -1)).toBe(-60);
	});
});

describe('compressorGainDb', () => {
	it('leaves levels under threshold alone', () => {
		expect(compressorGainDb(-20, -18.4, compressorSlope(3))).toBe(0);
	});

	it('pulls levels over threshold down by the slope', () => {
		// OBS computes slope * (threshold - env), so an over threshold level is negative
		expect(compressorGainDb(-10, -18.4, compressorSlope(3))).toBeCloseTo(
			(1 - 1 / 3) * (-18.4 - -10),
			10
		);
		expect(compressorGainDb(-10, -18.4, compressorSlope(3))).toBeLessThan(0);
	});
});

describe('limiter constants', () => {
	it('uses a near instant attack like OBS', () => {
		expect(VOICEOVER_LIMITER_ATTACK_SECONDS).toBeLessThanOrEqual(0.001);
		expect(gainCoefficient(RATE, VOICEOVER_LIMITER_ATTACK_SECONDS)).toBeLessThan(1e-6);
	});
});
