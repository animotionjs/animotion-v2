import { describe, expect, it } from 'vitest';
import {
	sortVoiceoverClips,
	validateSceneId,
	validateVoiceoverClip,
	validateVoiceoverManifest,
	voiceoverOverlaps,
	type VoiceoverClip
} from './types.js';

function clip(start: number, duration: number, id = 'recording'): VoiceoverClip {
	return {
		id,
		sceneId: 'intro',
		label: `Recording ${id}`,
		file: `${id}.webm`,
		start,
		duration,
		mime: 'audio/webm'
	};
}

describe('voiceover clips', () => {
	it('accepts scene ids with safe encoded path characters', () => {
		expect(() => validateSceneId('scene with spaces')).not.toThrow();
		expect(() => validateSceneId('../outside')).not.toThrow();
		expect(() => validateSceneId('..')).toThrow('Scene id');
	});

	it('sorts recordings by their start time', () => {
		const first = clip(2, 1, 'second');
		const second = clip(0, 1, 'first');
		expect(sortVoiceoverClips([first, second]).map((item) => item.id)).toEqual(['first', 'second']);
	});

	it('allows adjacent recordings but rejects overlap', () => {
		expect(voiceoverOverlaps(clip(0, 1), clip(1, 1))).toBe(false);
		expect(voiceoverOverlaps(clip(0, 1.1), clip(1, 1))).toBe(true);
	});

	it('rejects duplicate or overlapping manifest entries', () => {
		const first = clip(0, 1, 'first');
		const second = clip(0.5, 1, 'second');
		const base = { version: 1, sceneId: 'intro', timelineFps: 60 };

		expect(() => validateVoiceoverManifest({ ...base, clips: [first, first] })).toThrow(
			'duplicate ids'
		);
		expect(() => validateVoiceoverManifest({ ...base, clips: [first, second] })).toThrow(
			'overlapping recordings'
		);
	});

	it('validates persisted clip metadata', () => {
		expect(validateVoiceoverClip(clip(0, 1))).toEqual(clip(0, 1));
		expect(() => validateVoiceoverClip({ ...clip(0, 1), start: -1 })).toThrow('Voiceover start');
		expect(() => validateVoiceoverClip({ ...clip(0, 1), file: '../outside.webm' })).toThrow(
			'Voiceover clip file'
		);
	});
});
