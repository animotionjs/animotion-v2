import { describe, expect, it } from 'vitest';
import { clipStartAt, moveDelta, moveLimits } from './move.js';
import type { VoiceoverClip } from '../voiceover/types.js';

function clip(id: string, start: number, duration = 1): VoiceoverClip {
	return {
		id,
		label: id,
		file: `${id}.wav`,
		start,
		duration,
		trimStart: 0,
		sourceDuration: duration,
		mime: 'audio/wav'
	};
}

function window_(id: string, start: number, duration = 1) {
	return { id, start, duration, trimStart: 0 };
}

describe('clip start snapping', () => {
	it('never places a clip before the presentation', () => {
		expect(clipStartAt(-4, 30)).toBe(0);
	});

	it('lands on the frame grid', () => {
		expect(clipStartAt(1.01, 30)).toBe(1);
	});
});

describe('clip moving', () => {
	it('slides a lone clip to the left as well as to the right', () => {
		const clips = [clip('a', 3)];
		const limits = moveLimits([window_('a', 3)], clips);
		// the pointer two seconds to the left of the grab point
		expect(moveDelta(1, 3, 30, limits)).toBe(-2);
		expect(moveDelta(5, 3, 30, limits)).toBe(2);
	});

	it('reaches the presentation start even from a later grab', () => {
		const clips = [clip('a', 3)];
		const limits = moveLimits([window_('a', 3)], clips);
		expect(moveDelta(0, 3, 30, limits)).toBe(-3);
	});

	it('stops at the presentation start', () => {
		const clips = [clip('a', 2)];
		const limits = moveLimits([window_('a', 2)], clips);
		expect(moveDelta(-4, 2, 30, limits)).toBe(-2);
	});

	it('will not slide a clip into the one before it', () => {
		const clips = [clip('a', 0, 2), clip('b', 2, 1)];
		const limits = moveLimits([window_('b', 2)], clips);
		expect(moveDelta(0, 2, 30, limits)).toBe(0);
	});

	it('carries a whole selection by one shared delta', () => {
		const clips = [clip('a', 4), clip('b', 8)];
		const limits = moveLimits([window_('a', 4), window_('b', 8)], clips);
		expect(moveDelta(1, 4, 30, limits)).toBe(-3);
	});
});
