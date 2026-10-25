import { SvelteMap } from 'svelte/reactivity';
import type { Component } from 'svelte';
import { onScenesChanged } from '../config/scenes.js';
import type { Sequence } from '../scene/runtime/sequence.js';

/*
 * A scene module is imported once per page, the same way its timing is
 * measured once. Caching the resolved component keeps the preview out of an
 * await, so a redraw can never restart an import and remount the scene.
 */
const components = new SvelteMap<string, Component>();

/*
 * An edited scene replaces its module. Bumping the generation invalidates the
 * cache, and every reader of `componentsGeneration` warms it again from the
 * fresh glob, which is what brings the edit to the preview.
 */
let generation = $state(0);

/** The number of times scene modules have changed; read to warm again. */
export function componentsGeneration() {
	return generation;
}

onScenesChanged(() => {
	components.clear();
	generation += 1;
});

/** Starts loading every scene component once. Safe to call more than once. */
export function warmComponents(sequence: Sequence) {
	for (const entry of sequence) {
		if (components.has(entry.id) || !entry.component) continue;
		void entry.component().then((module) => components.set(entry.id, module.default));
	}
}

/** The loaded component for `id`, or `undefined` while it is still loading. */
export function getComponent(id: string) {
	return components.get(id);
}
