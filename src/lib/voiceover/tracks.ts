import { createAudioTrack, type AudioTrack } from '../scene/audio/tracks.js';
import { voiceoverEnd, type VoiceoverClip } from './types.js';

/**
 * Turns voiceover clips into audio tracks on the presentation clock, so the
 * editor and the player can both schedule them with one audio controller.
 * A clip may span any number of scenes, so nothing here knows about scenes.
 */
export function voiceoverTracks(
	clips: readonly VoiceoverClip[],
	sourceUrls: ReadonlyMap<string, string>
): AudioTrack[] {
	const tracks: AudioTrack[] = [];
	for (const clip of clips) {
		const src = sourceUrls.get(clip.id);
		if (src === undefined) continue;
		tracks.push(
			createAudioTrack(src, {
				at: clip.start,
				trimStart: clip.trimStart,
				duration: clip.duration
			})
		);
	}
	return tracks;
}

/** The clip covering `seconds`, or null when no narration is playing there. */
export function voiceoverAt(
	clips: readonly VoiceoverClip[],
	seconds: number
): VoiceoverClip | null {
	for (const clip of clips) {
		if (seconds >= clip.start - 1e-9 && seconds < voiceoverEnd(clip) - 1e-9) return clip;
	}
	return null;
}
