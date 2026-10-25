import { SvelteMap } from 'svelte/reactivity';
import { onScenesChanged } from '../config/scenes.js';
import type { SceneTimeline } from '../scene/runtime/runtime.svelte.js';

/** What measuring one scene at one frame rate produced. */
export interface SceneMeasurement {
	timeline: SceneTimeline;
	/** The scene's `[data-chapter]` label, or an empty string when it has none. */
	chapter: string;
}

/*
 * A scene's length is a frame count divided by the frame rate, so a
 * measurement only holds for the rate it was taken at. The key carries the
 * rate, which is why changing the frame rate remeasures and changing back
 * reuses what was already measured.
 */
function keyOf(id: string, fps: number) {
	return `${id}@${fps}`;
}

/*
 * Measuring a scene costs a component mount, so results are shared across
 * editor navigations. A scene edit drops them, because the timing it measured
 * no longer matches the code on screen.
 */
const measured = new SvelteMap<string, SceneTimeline>();

/** The shared measurement cache, read reactively when laying out the lanes. */
export const measuredScenes = measured;

/*
 * Chapter titles come from the same mount as the timing, so they live beside
 * it keyed the same way. They are separate from the timing map because the
 * lane layout only needs timing, while chapters are read on demand.
 */
const chapters = new SvelteMap<string, string>();

/** The shared chapter cache, read reactively when building the chapter list. */
export const measuredChapters = chapters;

/** The cached timeline for `id` at `fps`, or `undefined` before it is measured. */
export function getMeasured(id: string, fps: number) {
	return measured.get(keyOf(id, fps));
}

/** The cached chapter title for `id` at `fps`, or an empty string. */
export function getChapter(id: string, fps: number): string {
	return chapters.get(keyOf(id, fps)) ?? '';
}

/** Stores `timeline` and its chapter title for `id` at `fps`. */
export function setMeasured(id: string, fps: number, timeline: SceneTimeline, chapter = '') {
	const key = keyOf(id, fps);
	measured.set(key, timeline);
	chapters.set(key, chapter);
}

/* An edit changes a scene's timing, so every measurement is dropped. */
onScenesChanged(() => {
	measured.clear();
	chapters.clear();
});
