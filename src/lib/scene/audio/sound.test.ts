import { describe, expect, it } from 'vitest';
import {
	SOUND_NAMES,
	SOUND_SAMPLE_RATE,
	createSoundCue,
	synthesizeSound,
	mixSoundCues,
	encodePcm16,
	type SoundCue,
	type SoundName,
	type SoundOptions
} from './index';

const durations: Record<SoundName, number> = {
	click: 0.12,
	pop: 0.22,
	chime: 0.9,
	whoosh: 0.55,
	riser: 1.2,
	impact: 0.7
};

const invalidCues: Array<[string, () => SoundCue]> = [
	['an unknown name', () => createSoundCue('boom' as SoundName)],
	['a negative offset', () => createSoundCue('click', { at: -0.01 })],
	['a nonfinite offset', () => createSoundCue('click', { at: Number.NaN })],
	['an infinite offset', () => createSoundCue('click', { at: Number.POSITIVE_INFINITY })],
	['a negative delay', () => createSoundCue('click', { delay: -0.01 })],
	['a nonfinite delay', () => createSoundCue('click', { delay: Number.NaN })],
	['an infinite delay', () => createSoundCue('click', { delay: Number.POSITIVE_INFINITY })],
	['both at and delay', () => createSoundCue('click', { at: 0.1, delay: 0.2 })],
	['a zero duration', () => createSoundCue('click', { duration: 0 })],
	['a negative duration', () => createSoundCue('click', { duration: -0.1 })],
	['a nonfinite duration', () => createSoundCue('click', { duration: Number.NaN })],
	['a negative volume', () => createSoundCue('click', { volume: -0.01 })],
	['a volume above one', () => createSoundCue('click', { volume: 1.01 })],
	['a nonfinite volume', () => createSoundCue('click', { volume: Number.NaN })],
	['a zero pitch', () => createSoundCue('click', { pitch: 0 })],
	['a negative pitch', () => createSoundCue('click', { pitch: -1 })],
	['a nonfinite pitch', () => createSoundCue('click', { pitch: Number.POSITIVE_INFINITY })],
	['a fractional seed', () => createSoundCue('click', { seed: 1.5 })],
	['a nonfinite seed', () => createSoundCue('click', {}, Number.NaN)],
	['a negative fade in', () => createSoundCue('click', { fadeIn: -0.01 })],
	['a nonfinite fade in', () => createSoundCue('click', { fadeIn: Number.NaN })],
	['a negative fade out', () => createSoundCue('click', { fadeOut: -0.01 })],
	['a nonfinite fade out', () => createSoundCue('click', { fadeOut: Number.NaN })],
	[
		'fades longer than the duration',
		() => createSoundCue('click', { duration: 0.1, fadeIn: 0.07, fadeOut: 0.04 })
	]
];

describe('sound cues', () => {
	it('exposes every supported sound and the output sample rate', () => {
		expect(SOUND_NAMES).toEqual(['click', 'pop', 'chime', 'whoosh', 'riser', 'impact']);
		expect(SOUND_SAMPLE_RATE).toBe(48000);
	});

	it('creates normalized defaults for every preset', () => {
		for (const name of SOUND_NAMES) {
			expect(createSoundCue(name)).toEqual({
				name,
				at: 0,
				duration: durations[name],
				volume: 1,
				pitch: 1,
				seed: 1,
				fadeIn: 0.005,
				fadeOut: 0.04
			});
		}
	});

	it('keeps short custom sounds valid by shortening their default fades', () => {
		const cue = createSoundCue('click', { duration: 0.01 });

		expect(cue.fadeIn).toBeCloseTo(0.01 / 3);
		expect(cue.fadeOut).toBeCloseTo(0.01 / 3);
	});

	it('normalizes a relative delay to the cue start time', () => {
		const delayedCue = createSoundCue('click', { delay: 0.25 });
		const absoluteCue = createSoundCue('click', { at: 0.25 });

		expect(delayedCue).toEqual(absoluteCue);
		expect(delayedCue.at).toBe(0.25);
	});

	it('keeps supplied options and uses a supplied default seed', () => {
		const options: SoundOptions = {
			at: 0.25,
			duration: 1.5,
			volume: 0.4,
			pitch: 1.2,
			seed: -7,
			fadeIn: 0.1,
			fadeOut: 0.2
		};

		expect(createSoundCue('chime', options, 99)).toEqual({ name: 'chime', ...options });
		expect(createSoundCue('pop', {}, 42).seed).toBe(42);
		expect(createSoundCue('pop', { seed: 7 }, 42).seed).toBe(7);
		expect(createSoundCue('pop', { seed: 0 }, 42).seed).toBe(0);
	});

	it.each(invalidCues)('rejects %s', (_description, createCue) => {
		expect(createCue).toThrow(RangeError);
	});
});

describe('synthesizeSound', () => {
	it('returns the requested number of mono samples', () => {
		const cue = createSoundCue('click', {
			duration: 0.0105,
			fadeIn: 0,
			fadeOut: 0
		});
		const samples = synthesizeSound(cue, 8000);

		expect(samples).toBeInstanceOf(Float32Array);
		expect(samples.length).toBe(84);
	});

	it.each(SOUND_NAMES)('keeps tonal %s deterministic with phase variation by seed', (name) => {
		const cue = createSoundCue(name, { seed: 17 });
		const first = synthesizeSound(cue, 4000);
		const second = synthesizeSound(cue, 4000);
		const different = synthesizeSound({ ...cue, seed: 18 }, 4000);

		expect(second).toEqual(first);
		expect(different).not.toEqual(first);
	});

	it.each(SOUND_NAMES)('synthesizes a non silent bounded %s', (name) => {
		const samples = synthesizeSound(createSoundCue(name), 8000);
		const nonSilent = samples.some((sample) => Math.abs(sample) > 0.0001);
		const bounded = samples.every(
			(sample) => Number.isFinite(sample) && sample >= -1 && sample <= 1
		);

		expect(samples.length).toBe(Math.round(durations[name] * 8000));
		expect(nonSilent).toBe(true);
		expect(bounded).toBe(true);
	});

	it('gives each preset a distinct waveform', () => {
		const outputs = SOUND_NAMES.map((name) => synthesizeSound(createSoundCue(name), 4000));

		for (let first = 0; first < outputs.length; first++) {
			for (let second = first + 1; second < outputs.length; second++) {
				expect(outputs[first]).not.toEqual(outputs[second]);
			}
		}
	});

	it('applies volume and pitch', () => {
		const cue = createSoundCue('click', {
			duration: 0.03,
			pitch: 1,
			fadeIn: 0,
			fadeOut: 0
		});
		const full = synthesizeSound(cue, 4000);
		const quiet = synthesizeSound({ ...cue, volume: 0.5 }, 4000);
		const higher = synthesizeSound({ ...cue, pitch: 1.5 }, 4000);

		expect(Array.from(quiet)).toEqual(Array.from(full, (sample) => sample * 0.5));
		expect(higher).not.toEqual(full);
		expect(synthesizeSound({ ...cue, volume: 0 }, 4000).every((sample) => sample === 0)).toBe(true);
	});

	it('applies linear fade in and fade out envelopes', () => {
		const sampleRate = 100;
		const base = createSoundCue('chime', {
			duration: 1,
			volume: 0.7,
			seed: 9,
			fadeIn: 0,
			fadeOut: 0
		});
		const raw = synthesizeSound(base, sampleRate);
		const faded = synthesizeSound({ ...base, fadeIn: 0.25, fadeOut: 0.3 }, sampleRate);

		expect(faded[0]).toBe(0);
		expect(faded[faded.length - 1]).toBe(0);

		for (let index = 0; index < faded.length; index++) {
			const time = index / sampleRate;
			const remaining = (faded.length - 1 - index) / sampleRate;
			const gain = Math.min(time / 0.25, 1) * Math.min(remaining / 0.3, 1);
			expect(faded[index]).toBeCloseTo(raw[index] * gain, 6);
		}
	});

	it('validates the sample rate and cue', () => {
		const cue = createSoundCue('click');

		expect(() => synthesizeSound(cue, 0)).toThrow(RangeError);
		expect(() => synthesizeSound(cue, 1.5)).toThrow(RangeError);
		expect(() => synthesizeSound({ ...cue, duration: 0 })).toThrow(RangeError);
	});
});

describe('mixSoundCues', () => {
	it('returns an exact scene length', () => {
		const samples = mixSoundCues([], 0.0101, 8000);

		expect(samples).toBeInstanceOf(Float32Array);
		expect(samples.length).toBe(81);
	});

	it('places a cue at an integer sample offset', () => {
		const cue = createSoundCue('click', { at: 0.03, duration: 0.05 });
		const source = synthesizeSound(cue, 8000);
		const mixed = mixSoundCues([cue], 0.12, 8000);
		const offset = 240;

		expect(mixed.subarray(0, offset).every((sample) => sample === 0)).toBe(true);
		expect(mixed.subarray(offset, offset + source.length)).toEqual(source);
		expect(mixed.subarray(offset + source.length).every((sample) => sample === 0)).toBe(true);
	});

	it('clamps overlapping samples', () => {
		const cue = createSoundCue('click', { duration: 0.05 });
		const source = synthesizeSound(cue, 8000);
		const mixed = mixSoundCues([cue, cue], 0.05, 8000);
		const reachesClipping = source.some((sample) => Math.abs(sample) > 0.5);

		for (let index = 0; index < mixed.length; index++) {
			const sum = source[index] + source[index];
			const expected = Math.max(-1, Math.min(1, sum));
			expect(mixed[index]).toBe(expected);
		}

		expect(reachesClipping).toBe(true);
		expect(mixed.every((sample) => sample >= -1 && sample <= 1)).toBe(true);
	});

	it('truncates a clip at the scene end', () => {
		const cue = createSoundCue('click', { duration: 0.5 });
		const source = synthesizeSound(cue, 8000);
		const mixed = mixSoundCues([cue], 0.1, 8000);

		expect(mixed).toEqual(source.subarray(0, 800));
		expect(mixed.length).toBe(800);
	});

	it('ignores cues that start after the scene', () => {
		const cue = createSoundCue('impact', { at: 2, duration: 0.1 });
		const mixed = mixSoundCues([cue], 0.1, 8000);

		expect(mixed.length).toBe(800);
		expect(mixed.every((sample) => sample === 0)).toBe(true);
	});

	it('validates scene duration, sample rate, and cues', () => {
		expect(() => mixSoundCues([], -1)).toThrow(RangeError);
		expect(() => mixSoundCues([], Number.NaN)).toThrow(RangeError);
		expect(() => mixSoundCues([], 1, 0)).toThrow(RangeError);
		expect(() => mixSoundCues([{ ...createSoundCue('click'), volume: 2 }], 1)).toThrow(RangeError);
	});
});

describe('encodePcm16', () => {
	it('rounds and clamps mono samples to signed 16 bit PCM', () => {
		const samples = new Float32Array([
			-2,
			-1,
			-0.5,
			-0,
			0,
			0.5,
			1,
			2,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY
		]);
		const encoded = encodePcm16(samples);

		expect(encoded).toBeInstanceOf(Int16Array);
		expect(encoded).toEqual(
			new Int16Array([-32768, -32768, -16384, 0, 0, 16384, 32767, 32767, 0, 32767, -32768])
		);
		expect(encoded.length).toBe(samples.length);
	});

	it('preserves an empty buffer', () => {
		const encoded = encodePcm16(new Float32Array());

		expect(encoded).toBeInstanceOf(Int16Array);
		expect(encoded.length).toBe(0);
	});
});
