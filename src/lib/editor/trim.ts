import type { VoiceoverWindow } from '../voiceover/types.js';

/** How far a clip's edge may move while it is trimmed. */
export interface VoiceoverTrimLimits {
	/** The soonest the clip may start, set by the clip before it. */
	minStart: number;
	/** The latest the clip may end, set by the clip after it. */
	maxEnd: number;
	/** Length of the whole recording, so the right edge cannot pass it. */
	sourceDuration: number;
	/** Shortest played length a trim may leave. */
	minDuration: number;
}

function clamp(value: number, low: number, high: number): number {
	if (value < low) return low;
	if (value > high) return high;
	return value;
}

/**
 * Moves the left edge of a clip. The source right edge is held still, so the
 * part of the recording that plays at the end never shifts. The right edge of
 * the window stays where it is on the timeline, so trimming from the left only
 * moves the start.
 */
export function trimStartEdge(
	origin: VoiceoverWindow,
	limits: VoiceoverTrimLimits,
	start: number
): VoiceoverWindow {
	const right = origin.start + origin.duration;
	// the file cannot be trimmed before its first sample, nor into a neighbour
	const lowest = Math.max(limits.minStart, origin.start - origin.trimStart, 0);
	const highest = Math.max(lowest, right - limits.minDuration);
	const next = clamp(start, lowest, highest);
	const shift = next - origin.start;
	return {
		start: next,
		duration: origin.duration - shift,
		trimStart: origin.trimStart + shift
	};
}

/**
 * Moves the right edge of a clip. The source left edge is held still, so the
 * part of the recording that plays at the start never shifts. The window can
 * only reach as far as the end of the recording or the next clip.
 */
export function trimEndEdge(
	origin: VoiceoverWindow,
	limits: VoiceoverTrimLimits,
	end: number
): VoiceoverWindow {
	const lowest = origin.start + limits.minDuration;
	const fromSource = origin.start + (limits.sourceDuration - origin.trimStart);
	const highest = Math.max(lowest, Math.min(limits.maxEnd, fromSource));
	const next = clamp(end, lowest, highest);
	return {
		start: origin.start,
		duration: next - origin.start,
		trimStart: origin.trimStart
	};
}
