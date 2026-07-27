import type { Component } from 'svelte';

interface SceneEntry {
	slug: string;
	order: number;
	component: () => Promise<{ default: Component }>;
}

const NAME_PATTERN = /^(\d+)-(.+)$/;

function parseName(path: string): string {
	const stripped = path.replace('./', '');
	return stripped.includes('/') ? stripped.split('/')[0] : stripped.replace('.svelte', '');
}

function buildDeck(): SceneEntry[] {
	const entries = Object.entries(import.meta.glob(['./*.svelte', './*/slide.svelte']));

	const scenes: SceneEntry[] = [];
	const sources = new Map<string, string>();

	for (const [path, component] of entries) {
		const name = parseName(path);
		const match = name.match(NAME_PATTERN);
		if (!match) {
			throw new Error(`Scene "${name}" must start with a number prefix (e.g., "01-intro")`);
		}
		const slug = match[2];
		if (sources.has(slug)) {
			throw new Error(`Duplicate slide slug "${slug}" (from ${sources.get(slug)} and ${path})`);
		}
		sources.set(slug, path);
		scenes.push({
			slug,
			order: parseInt(match[1]),
			component: component as () => Promise<{ default: Component }>
		});
	}

	return scenes.sort((a, b) => a.order - b.order);
}

export const deck: SceneEntry[] = buildDeck();
