import { describe, expect, it } from 'vitest';
import { fadeGain } from './fades.js';
import { createAudioTrack } from './tracks.js';

describe('fadeGain', () => {
	it('stays at full gain without fades', () => {
		const track = createAudioTrack('sfx.mp3', { duration: 2 });
		expect(fadeGain(track, 0, 4)).toBe(1);
		expect(fadeGain(track, 1, 4)).toBe(1);
		expect(fadeGain(track, 1.99, 4)).toBe(1);
	});

	it('ramps the fade in linearly', () => {
		const track = createAudioTrack('sfx.mp3', { duration: 2, fadeIn: 0.5 });
		expect(fadeGain(track, 0, 4)).toBe(0);
		expect(fadeGain(track, 0.25, 4)).toBeCloseTo(0.5);
		expect(fadeGain(track, 0.5, 4)).toBe(1);
	});

	it('ramps the fade out linearly and lands silent before the end', () => {
		const track = createAudioTrack('sfx.mp3', { duration: 2, fadeOut: 0.5 });
		expect(fadeGain(track, 1.4, 4)).toBe(1);
		expect(fadeGain(track, 1.5, 4)).toBeCloseTo(0.8);
		expect(fadeGain(track, 1.75, 4)).toBeCloseTo(0.3);
		expect(fadeGain(track, 1.9, 4)).toBe(0);
		expect(fadeGain(track, 2, 4)).toBe(0);
	});

	it('combines both fades at the lower gain', () => {
		const track = createAudioTrack('sfx.mp3', { duration: 1, fadeIn: 0.4, fadeOut: 0.4 });
		expect(fadeGain(track, 0.2, 4)).toBeCloseTo(0.5);
		expect(fadeGain(track, 0.5, 4)).toBe(1);
		expect(fadeGain(track, 0.8, 4)).toBeCloseTo(0.25);
		expect(fadeGain(track, 0.9, 4)).toBe(0);
	});

	it('drops a fade at least as long as the cue like the render does', () => {
		const track = createAudioTrack('sfx.mp3', { duration: 1, fadeIn: 1, fadeOut: 0 });
		expect(fadeGain(track, 0.2, 4)).toBe(1);
	});

	it('measures open loops against the scene remainder', () => {
		const track = createAudioTrack('sfx.mp3', { at: 1, loop: true, fadeOut: 1 });
		expect(fadeGain(track, 1.5, 4)).toBe(1);
		expect(fadeGain(track, 2.5, 4)).toBeCloseTo(0.4);
		expect(fadeGain(track, 2.9, 4)).toBe(0);
	});

	it('scales the landing margin down for tiny cues instead of silencing them', () => {
		const track = createAudioTrack('sfx.mp3', { duration: 0.1, fadeOut: 0.08 });
		expect(fadeGain(track, 0, 4)).toBeCloseTo(0.625);
		expect(fadeGain(track, 0.05, 4)).toBe(0);
	});

	it('clamps outside the cue', () => {
		const track = createAudioTrack('sfx.mp3', { duration: 1, fadeIn: 0.2, fadeOut: 0.2 });
		expect(fadeGain(track, -1, 4)).toBe(0);
		expect(fadeGain(track, 5, 4)).toBe(0);
	});
});
