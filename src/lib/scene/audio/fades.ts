import type { AudioTrack } from './tracks.js';

/** Silence before the end so stopping never clicks. Shared with the render. */
export const FADE_LANDING_MARGIN_SECONDS = 0.1;

/**
 * How loud one sound is right now, with fades applied. Uses the same
 * fade rules as the render so the preview sounds like the final video.
 */
export function fadeGain(track: AudioTrack, local: number, sceneDuration: number): number {
	const window = track.duration !== null ? track.duration : Math.max(0, sceneDuration - track.at);
	const margin = Math.min(FADE_LANDING_MARGIN_SECONDS, window / 2);
	let gain = 1;
	if (window > 0 && Number.isFinite(window)) {
		if (track.fadeIn > 0 && track.fadeIn < window && local < track.fadeIn) {
			gain = Math.min(gain, Math.max(0, local) / track.fadeIn);
		}
		if (track.fadeOut > 0 && track.fadeOut < window && local > window - track.fadeOut - margin) {
			gain = Math.min(gain, Math.max(0, window - margin - local) / track.fadeOut);
		}
	}
	return Math.max(0, Math.min(1, gain));
}
