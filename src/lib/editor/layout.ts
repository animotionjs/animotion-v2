import type { SceneEntry, Sequence } from '../scene/runtime/sequence.js';
import type { UiTimeline } from '../canvas/ui.js';

/** One scene block on the editor timeline, placed at an absolute offset. */
export interface EditorLane {
	/** Scene id, matching the sequence entry. */
	id: string;
	/** The scene this block draws. */
	entry: SceneEntry;
	/** Measured timing, or `null` while the scene has not been measured. */
	timeline: UiTimeline | null;
	/** The scene's chapter label, or an empty string when it has none. */
	chapter: string;
	/** Seconds from the presentation start where this scene begins. */
	start: number;
	/** Seconds this scene occupies, `0` while unmeasured. */
	duration: number;
}

/** A point on the presentation timeline resolved to a scene and a local time. */
export interface EditorPoint {
	/** Index into the lane list. */
	index: number;
	/** Seconds within the scene that owns the point. */
	local: number;
}

/** One drawn region inside a scene block, in presentation seconds. */
export interface SceneRegion {
	/** What the region shows, so it can be styled differently. */
	kind: 'enter' | 'hold' | 'step' | 'wait';
	/** Presentation seconds where the region starts. */
	start: number;
	/** Presentation seconds where the region ends. */
	end: number;
}

/**
 * Places every scene end to end in sequence order. An unmeasured scene takes
 * no room, so the total grows as measurements arrive instead of the layout
 * shifting under the playhead once they do.
 *
 * Measurements are keyed by scene and frame rate, so `fps` decides which
 * measurement a block reads. A scene measured at another rate counts as
 * unmeasured here, and the total follows the rate in use.
 */
export function layoutLanes(
	sequence: Sequence,
	measured: Map<string, UiTimeline>,
	fps: number,
	chapters: ReadonlyMap<string, string> = new Map()
): EditorLane[] {
	const lanes: EditorLane[] = [];
	let cursor = 0;
	for (const entry of sequence) {
		const timeline = measured.get(`${entry.id}@${fps}`) ?? null;
		const duration = timeline?.totalDuration ?? 0;
		const chapter = chapters.get(`${entry.id}@${fps}`) ?? '';
		lanes.push({ id: entry.id, entry, timeline, chapter, start: cursor, duration });
		cursor += duration;
	}
	return lanes;
}

/** Total seconds across every measured scene. */
export function totalDuration(lanes: readonly EditorLane[]): number {
	let total = 0;
	for (const lane of lanes) total += lane.duration;
	return total;
}

/**
 * Regions to draw inside a scene block. A step contributes its hold, its
 * animation and its wait as separate regions, so the block shows where the
 * scene rests and where it moves.
 */
export function sceneRegions(lane: EditorLane): SceneRegion[] {
	const timeline = lane.timeline;
	if (!timeline) return [];
	const regions: SceneRegion[] = [];
	let cursor = lane.start;

	if (timeline.enterDuration > 0) {
		regions.push({ kind: 'enter', start: cursor, end: cursor + timeline.enterDuration });
		cursor += timeline.enterDuration;
	}

	timeline.steps.forEach((step, index) => {
		const hold = index === 0 ? timeline.introHold : 0;
		if (hold > 0) {
			regions.push({ kind: 'hold', start: cursor, end: cursor + hold });
			cursor += hold;
		}
		if (step.duration > 0) {
			regions.push({ kind: 'step', start: cursor, end: cursor + step.duration });
			cursor += step.duration;
		}
		if (step.wait > 0) {
			regions.push({ kind: 'wait', start: cursor, end: cursor + step.wait });
			cursor += step.wait;
		}
	});

	return regions;
}

/**
 * Finds the lane under `seconds`. A time past the measured end resolves to
 * the last measured lane at its end, so the playhead always has a home.
 */
export function laneAt(lanes: readonly EditorLane[], seconds: number): EditorPoint {
	if (lanes.length === 0) return { index: 0, local: 0 };
	const time = Math.max(0, seconds);
	for (let index = 0; index < lanes.length; index++) {
		const lane = lanes[index]!;
		if (lane.duration > 0 && time < lane.start + lane.duration) {
			return { index, local: time - lane.start };
		}
	}
	for (let index = lanes.length - 1; index >= 0; index--) {
		const lane = lanes[index]!;
		if (lane.duration > 0) return { index, local: lane.duration };
	}
	return { index: lanes.length - 1, local: 0 };
}
