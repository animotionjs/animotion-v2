import { describe, expect, it } from 'vitest';
import {
	sortVoiceoverClips,
	validateProject,
	validateVoiceoverClip,
	validateVoiceoverTrack,
	voiceoverOverlaps,
	type VoiceoverClip
} from './types.js';

function clip(overrides: Partial<VoiceoverClip> = {}): VoiceoverClip {
	return {
		id: 'clip-1',
		label: 'Recording 1',
		file: 'clip-1.wav',
		start: 1,
		duration: 2,
		trimStart: 0,
		sourceDuration: 2,
		mime: 'audio/wav',
		...overrides
	};
}

function track(clips: VoiceoverClip[]) {
	return { version: 1, project: 'example', clips };
}

describe('validateProject', () => {
	it('accepts a slug', () => {
		expect(() => validateProject('example')).not.toThrow();
		expect(() => validateProject('my-project_2')).not.toThrow();
	});

	it('rejects a traversal or empty slug', () => {
		expect(() => validateProject('')).toThrow(RangeError);
		expect(() => validateProject('..')).toThrow(RangeError);
		expect(() => validateProject('a/b')).toThrow(RangeError);
	});
});

describe('validateVoiceoverClip', () => {
	it('fills a default label', () => {
		const value = validateVoiceoverClip({
			id: 'abcdefgh',
			file: 'abcdefgh.wav',
			start: 0,
			duration: 1,
			mime: 'audio/wav'
		});
		expect(value.label).toBe('Recording abcdefgh');
	});

	it('rejects a negative start, an empty duration and an unknown mime', () => {
		expect(() => validateVoiceoverClip({ ...clip(), start: -1 })).toThrow(RangeError);
		expect(() => validateVoiceoverClip({ ...clip(), duration: 0 })).toThrow(RangeError);
		expect(() => validateVoiceoverClip({ ...clip(), mime: 'audio/flac' })).toThrow(RangeError);
	});

	it('rejects a file outside the project directory', () => {
		expect(() => validateVoiceoverClip({ ...clip(), file: '../escape.wav' })).toThrow(RangeError);
	});

	it('allows a clip that starts past the end of any scene', () => {
		const value = validateVoiceoverClip(clip({ start: 3600, duration: 30, sourceDuration: 30 }));
		expect(value.start).toBe(3600);
	});

	it('defaults a clip without a trim to the whole recording', () => {
		const value = validateVoiceoverClip({
			id: 'abcdefgh',
			file: 'abcdefgh.wav',
			start: 0,
			duration: 2,
			mime: 'audio/wav'
		});
		expect(value.trimStart).toBe(0);
		expect(value.sourceDuration).toBe(2);
	});

	it('keeps a trim window inside the recording', () => {
		expect(validateVoiceoverClip(clip({ trimStart: 0.5, duration: 1.5 })).trimStart).toBe(0.5);
		expect(() => validateVoiceoverClip(clip({ trimStart: -1 }))).toThrow(RangeError);
		expect(() => validateVoiceoverClip(clip({ trimStart: 1, duration: 2 }))).toThrow(RangeError);
		expect(() => validateVoiceoverClip(clip({ sourceDuration: 0 }))).toThrow(RangeError);
	});
});

describe('validateVoiceoverTrack', () => {
	it('accepts a track with no clips', () => {
		expect(validateVoiceoverTrack(track([]))).toEqual(track([]));
	});

	it('rejects duplicate ids and overlapping clips', () => {
		expect(() => validateVoiceoverTrack(track([clip(), clip({ id: 'clip-1' })]))).toThrow(
			/duplicate/
		);
		expect(() =>
			validateVoiceoverTrack(track([clip(), clip({ id: 'clip-2', start: 2, duration: 2 })]))
		).toThrow(/overlapping/);
	});

	it('accepts clips that only touch', () => {
		expect(() =>
			validateVoiceoverTrack(track([clip(), clip({ id: 'clip-2', start: 3, duration: 1 })]))
		).not.toThrow();
	});
});

describe('voiceoverOverlaps', () => {
	it('ignores a gap and flags a real overlap', () => {
		expect(voiceoverOverlaps({ start: 0, duration: 1 }, { start: 1.5, duration: 1 })).toBe(false);
		expect(voiceoverOverlaps({ start: 0, duration: 2 }, { start: 1.5, duration: 1 })).toBe(true);
	});

	it('treats clips that only touch as separate', () => {
		// a clip ending exactly where the next begins is the common case
		expect(voiceoverOverlaps({ start: 0, duration: 1 }, { start: 1, duration: 1 })).toBe(false);
		expect(voiceoverOverlaps({ start: 1, duration: 1 }, { start: 0, duration: 1 })).toBe(false);
	});

	it('flags a one frame overlap on either side', () => {
		const frame = 1 / 60;
		expect(voiceoverOverlaps({ start: 0, duration: 1 }, { start: 1 - frame, duration: 1 })).toBe(
			true
		);
		expect(voiceoverOverlaps({ start: 1 - frame, duration: 1 }, { start: 0, duration: 1 })).toBe(
			true
		);
	});

	it('flags a clip fully inside another', () => {
		expect(voiceoverOverlaps({ start: 0, duration: 4 }, { start: 1, duration: 1 })).toBe(true);
		expect(voiceoverOverlaps({ start: 1, duration: 1 }, { start: 0, duration: 4 })).toBe(true);
	});
});

describe('sortVoiceoverClips', () => {
	it('orders by start without touching the input', () => {
		const input = [clip({ id: 'b', start: 5 }), clip({ id: 'a', start: 1 })];
		expect(sortVoiceoverClips(input).map((item) => item.id)).toEqual(['a', 'b']);
		expect(input.map((item) => item.id)).toEqual(['b', 'a']);
	});
});
