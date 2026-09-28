import { describe, expect, it } from 'vitest';
import { createAudioTrack, validateAudioTrack } from './tracks.js';

describe('createAudioTrack', () => {
	it('fills defaults', () => {
		expect(createAudioTrack('sfx.mp3')).toMatchObject({
			src: 'sfx.mp3',
			at: 0,
			volume: 1,
			rate: 1,
			loop: false,
			trimStart: 0,
			duration: null,
			fadeIn: 0,
			fadeOut: 0
		});
	});

	it('maps delay to at', () => {
		expect(createAudioTrack('sfx.mp3', { delay: 0.5 }).at).toBe(0.5);
	});

	it('rejects at combined with delay', () => {
		expect(() => createAudioTrack('sfx.mp3', { at: 1, delay: 1 })).toThrow(RangeError);
	});

	it('rejects a negative delay', () => {
		expect(() => createAudioTrack('sfx.mp3', { delay: -0.1 })).toThrow(RangeError);
	});

	it('rejects an empty src', () => {
		expect(() => createAudioTrack('')).toThrow(RangeError);
	});

	it('rejects volume outside 0 to 1', () => {
		expect(() => createAudioTrack('sfx.mp3', { volume: 1.5 })).toThrow(RangeError);
		expect(() => createAudioTrack('sfx.mp3', { volume: -0.1 })).toThrow(RangeError);
	});

	it('rejects a nonpositive rate', () => {
		expect(() => createAudioTrack('sfx.mp3', { rate: 0 })).toThrow(RangeError);
	});

	it('rejects overlapping fades', () => {
		expect(() => createAudioTrack('sfx.mp3', { duration: 1, fadeIn: 0.6, fadeOut: 0.6 })).toThrow(
			RangeError
		);
	});

	it('accepts fades that exactly fill the duration', () => {
		expect(createAudioTrack('sfx.mp3', { duration: 1, fadeIn: 0.5, fadeOut: 0.5 })).toMatchObject({
			fadeIn: 0.5,
			fadeOut: 0.5
		});
	});

	it('validateAudioTrack rejects a zero duration', () => {
		expect(() =>
			validateAudioTrack({
				src: 'sfx.mp3',
				at: 0,
				volume: 1,
				rate: 1,
				loop: false,
				trimStart: 0,
				duration: 0,
				fadeIn: 0,
				fadeOut: 0
			})
		).toThrow(RangeError);
	});
});
