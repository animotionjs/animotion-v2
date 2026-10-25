import { describe, expect, it } from 'vitest';
import { trimEndEdge, trimStartEdge } from './trim.js';
import type { VoiceoverTrimLimits } from './trim.js';
import type { VoiceoverWindow } from '../voiceover/types.js';

const FRAME = 1 / 60;

function window(start: number, duration: number, trimStart = 0): VoiceoverWindow {
	return { start, duration, trimStart };
}

function limits(overrides: Partial<VoiceoverTrimLimits> = {}): VoiceoverTrimLimits {
	return { minStart: 0, maxEnd: 30, sourceDuration: 10, minDuration: FRAME, ...overrides };
}

describe('trimStartEdge', () => {
	it('moves the start and the source together, holding the timeline end', () => {
		const next = trimStartEdge(window(2, 4, 1), limits(), 3);
		// the clip starts a second later, so it plays a second less and skips it
		expect(next.start).toBe(3);
		expect(next.trimStart).toBe(2);
		expect(next.duration).toBe(3);
	});

	it('cannot be dragged before the first sample of the recording', () => {
		const next = trimStartEdge(window(2, 4, 1), limits(), 0);
		// only the already skipped second can be given back
		expect(next.start).toBe(1);
		expect(next.trimStart).toBe(0);
		expect(next.duration).toBe(5);
	});

	it('cannot be dragged before the first sample of the recording', () => {
		// the trim already skipped three seconds, so only those come back
		const next = trimStartEdge(window(5, 4, 3), limits(), 0);
		expect(next.start).toBe(2);
		expect(next.duration).toBe(7);
	});

	it('cannot be dragged into the clip before it', () => {
		const next = trimStartEdge(window(5, 4, 3), limits({ minStart: 3 }), 0);
		expect(next.start).toBe(3);
		expect(next.duration).toBe(6);
	});

	it('cannot be dragged into the clip after it, and leaves one frame', () => {
		const next = trimStartEdge(window(2, 4), limits(), 100);
		expect(next.start).toBe(6 - FRAME);
		expect(next.duration).toBeCloseTo(FRAME, 9);
	});
});

describe('trimEndEdge', () => {
	it('moves the end and the duration, holding the start and the source', () => {
		const next = trimEndEdge(window(2, 4, 1), limits(), 5);
		expect(next.start).toBe(2);
		expect(next.trimStart).toBe(1);
		expect(next.duration).toBe(3);
	});

	it('cannot reach past the end of the recording', () => {
		const next = trimEndEdge(window(2, 4, 1), limits({ sourceDuration: 6 }), 100);
		// the source gives eight seconds from the trim, but only five remain
		expect(next.duration).toBe(5);
	});

	it('cannot reach past the clip after it', () => {
		const next = trimEndEdge(window(2, 4), limits({ maxEnd: 8 }), 100);
		expect(next.duration).toBe(6);
	});

	it('cannot be dragged before the clip start, and leaves one frame', () => {
		const next = trimEndEdge(window(2, 4), limits(), 0);
		expect(next.duration).toBeCloseTo(FRAME, 9);
	});
});
