import type { Component } from 'svelte';
import type { SceneEntry } from '#lib/scene';
import './register';

const NAME_PATTERN = /^(\d+)-(.+)$/;

function parseName(path: string): string {
	const rest = path.replace(/^.*?\/scenes\//, '');
	const first = rest.split('/')[0];
	return first.replace(/\.svelte$/, '');
}

function buildSequence(): SceneEntry[] {
	const entries = Object.entries(
		import.meta.glob(['../../scenes/*.svelte', '../../scenes/*/slide.svelte'])
	);

	const scenes: SceneEntry[] = [];
	const sources = new Map<string, string>();

	for (const [path, component] of entries) {
		const name = parseName(path);
		const match = name.match(NAME_PATTERN);
		if (!match) {
			throw new Error(`Scene "${name}" must start with a number prefix (e.g., "01-intro")`);
		}
		const id = match[2];
		if (sources.has(id)) {
			throw new Error(`Duplicate scene id "${id}" (from ${sources.get(id)} and ${path})`);
		}
		sources.set(id, path);
		scenes.push({
			id,
			order: parseInt(match[1]),
			component: component as () => Promise<{ default: Component }>
		});
	}

	return scenes.sort((a, b) => a.order - b.order);
}

export const sequence: SceneEntry[] = buildSequence();
