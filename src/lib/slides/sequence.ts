import type { Component } from 'svelte';
import { parseSceneMarkdown } from './markdown.js';
import type { SceneTransitionConfig } from './transitions.js';

interface BaseScene {
	id: string;
	order: number;
	transition?: SceneTransitionConfig;
}

export interface SvelteScene extends BaseScene {
	kind: 'svelte';
	component: Component;
}

export interface MarkdownScene extends BaseScene {
	kind: 'markdown';
	source: string;
}

export type SceneEntry = SvelteScene | MarkdownScene;
export type Sequence = SceneEntry[];

export interface SvelteSceneModule {
	default: Component;
	transition?: SceneTransitionConfig;
}

const NAME_PATTERN = /^(\d+)-(.+)$/;

/**
 * Builds the ordered scene sequence from Svelte and Markdown scene modules.
 *
 * Scene names must be `<digits>-<name>`, where the digit prefix sets the order
 * and `name` becomes the scene id. Both must be unique.
 *
 * @throws if a scene name has no numeric prefix, or if two scenes share an id
 *   or an order
 */
export function createSequence(
	svelteEntries: Record<string, SvelteSceneModule>,
	markdownEntries: Record<string, string>
): Sequence {
	const scenes: SceneEntry[] = [];
	const ids = new Map<string, string>();
	const orders = new Map<number, string>();

	for (const [path, module] of Object.entries(svelteEntries)) {
		const parsed = parseScenePath(path, ids, orders);
		scenes.push({
			kind: 'svelte',
			...parsed,
			component: module.default,
			transition: module.transition
		});
	}

	for (const [path, source] of Object.entries(markdownEntries)) {
		const parsed = parseScenePath(path, ids, orders);
		const document = parseSceneMarkdown(source);
		scenes.push({
			kind: 'markdown',
			...parsed,
			source: document.body,
			transition: document.transition
		});
	}

	return scenes.sort((a, b) => a.order - b.order);
}

function parseScenePath(
	path: string,
	ids: Map<string, string>,
	orders: Map<number, string>
): { id: string; order: number } {
	const rest = path.replace(/^.*?\/scenes\//, '');
	const first = rest.split('/')[0] ?? '';
	const name = first.replace(/\.(svelte|md)$/, '');
	const match = name.match(NAME_PATTERN);
	if (!match) {
		throw new Error(`Scene "${name}" must start with a number prefix (e.g., "01-intro")`);
	}

	const id = match[2] ?? '';
	const order = Number(match[1]);
	const idSource = ids.get(id);
	if (idSource) throw new Error(`Duplicate scene id "${id}" (from ${idSource} and ${path})`);
	const orderSource = orders.get(order);
	if (orderSource) {
		throw new Error(`Duplicate scene order "${order}" (from ${orderSource} and ${path})`);
	}

	ids.set(id, path);
	orders.set(order, path);
	return { id, order };
}
