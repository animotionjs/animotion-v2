import { describe, expect, it } from 'vitest';
import { voiceoverAt, voiceoverTracks } from './tracks.js';
import type { VoiceoverClip } from './types.js';

function clip(overrides: Partial<VoiceoverClip> = {}): VoiceoverClip {
	return {
		id: 'clip-1',
		label: 'Recording 1',
		file: 'clip-1.wav',
		start: 4,
		duration: 3,
		trimStart: 0,
		sourceDuration: 3,
		mime: 'audio/wav',
		...overrides
	};
}

describe('voiceoverTracks', () => {
	it('places a clip on the presentation clock', () => {
		const urls = new Map([['clip-1', 'blob:one']]);
		const tracks = voiceoverTracks([clip()], urls);
		expect(tracks).toHaveLength(1);
		expect(tracks[0]).toMatchObject({ src: 'blob:one', at: 4, duration: 3, volume: 1 });
	});

	it('skips a clip whose audio has not been read yet', () => {
		expect(voiceoverTracks([clip()], new Map())).toEqual([]);
	});

	it('keeps a clip that spans a scene boundary as one track', () => {
		const clips = [clip({ start: 1, duration: 10 })];
		const tracks = voiceoverTracks(clips, new Map([['clip-1', 'blob:one']]));
		expect(tracks).toHaveLength(1);
		expect(tracks[0]?.duration).toBe(10);
	});

	it('carries a trim into the audio track', () => {
		const clips = [clip({ trimStart: 1.5, duration: 2, sourceDuration: 5 })];
		const tracks = voiceoverTracks(clips, new Map([['clip-1', 'blob:one']]));
		expect(tracks[0]).toMatchObject({ at: 4, trimStart: 1.5, duration: 2 });
	});
});

describe('voiceoverAt', () => {
	const clips = [
		clip({ id: 'a', start: 1, duration: 2 }),
		clip({ id: 'b', start: 5, duration: 2 })
	];

	it('finds the covering clip and nothing in a gap', () => {
		expect(voiceoverAt(clips, 1.5)?.id).toBe('a');
		expect(voiceoverAt(clips, 4)?.id).toBeUndefined();
	});

	it('treats the end of a clip as outside it', () => {
		expect(voiceoverAt(clips, 3)).toBeNull();
		expect(voiceoverAt(clips, 7)).toBeNull();
	});
});
