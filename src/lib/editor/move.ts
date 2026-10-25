import type { VoiceoverClip, VoiceoverWindow } from '../voiceover/types.js';

/** How far a group of clips may slide before it hits the start or a neighbour. */
export interface MoveLimits {
	/** Most a clip may move to the left, as a negative delta. */
	min: number;
	/** Most a clip may move to the right. */
	max: number;
}

/**
 * Where a clip lands for a pointer time. The time is snapped onto the frame
 * grid and clamped to zero, so a clip can never start before the presentation.
 */
export function clipStartAt(pointerSeconds: number, fps: number): number {
	return Math.max(0, Math.round(Math.max(0, pointerSeconds) * fps) / fps);
}

/**
 * How far the selected clips may slide before the leftmost one passes the
 * start of the presentation or a dragged clip would run into a clip that is
 * staying put. One shared delta keeps every clip on the frame grid.
 */
export function moveLimits(
	origins: readonly ({ id: string } & VoiceoverWindow)[],
	clips: readonly VoiceoverClip[]
): MoveLimits {
	let min = Number.NEGATIVE_INFINITY;
	let max = Number.POSITIVE_INFINITY;
	for (const origin of origins) {
		min = Math.max(min, 0 - origin.start);
		for (const other of clips) {
			if (origins.some((item) => item.id === other.id)) continue;
			const gap = other.start - (origin.start + origin.duration);
			if (gap > -1e-9) max = Math.min(max, gap);
			const back = origin.start - (other.start + other.duration);
			if (back > -1e-9) min = Math.max(min, 0 - back);
		}
	}
	return { min, max: Math.max(min, max) };
}

/**
 * The shared delta for one drag. The pointer is resolved to a clip start
 * before the grabbed start is taken away, so a drag to the left gives a
 * negative delta instead of being clamped back to zero.
 */
export function moveDelta(
	pointerSeconds: number,
	grabbedStart: number,
	fps: number,
	limits: MoveLimits
): number {
	const raw = clipStartAt(pointerSeconds, fps) - grabbedStart;
	return Math.max(limits.min, Math.min(limits.max, raw));
}
