import type { Component } from 'svelte';

/** One scene in the presentation: its `id` and position in the `sequence`. */
export interface SceneEntry {
	/** Scene id, from the name after the numeric prefix (e.g. `intro`). */
	id: string;
	/** Sort position, from the numeric prefix of the scene name. */
	order: number;
	/** Lazily imports the scene component on first visit. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a scene may be any component
	component: () => Promise<{ default: Component<any> }>;
}

/** Ordered list of scenes, sorted by `order`. */
export type Sequence = SceneEntry[];

type SceneModule = { default: Component };

const NAME_PATTERN = /^(\d+)-(.+)$/;

function parseName(path: string): string {
	const rest = path.replace(/^.*?\/scenes\//, '');
	const first = rest.split('/')[0];
	return first.replace(/\.svelte$/, '');
}

/**
 * Builds the ordered scene sequence from a glob of scene modules.
 *
 * Scene names must be `<digits>-<name>`, where the digit prefix sets the order
 * (ascending, any number of digits) and `name` becomes the scene id; both must
 * be unique.
 *
 * @throws if a scene name has no numeric prefix, or if two scenes share an id
 *   or an order
 */
export function createSequence(entries: Record<string, () => Promise<unknown>>): Sequence {
	const scenes: SceneEntry[] = [];
	const ids = new Map<string, string>();
	const orders = new Map<number, string>();

	for (const [path, component] of Object.entries(entries)) {
		const name = parseName(path);
		const match = name.match(NAME_PATTERN);
		if (!match) {
			throw new Error(`Scene "${name}" must start with a number prefix (e.g., "01-intro")`);
		}
		const id = match[2];
		const idSource = ids.get(id);
		if (idSource) {
			throw new Error(`Duplicate scene id "${id}" (from ${idSource} and ${path})`);
		}
		const order = parseInt(match[1]);
		const orderSource = orders.get(order);
		if (orderSource) {
			throw new Error(`Duplicate scene order "${order}" (from ${orderSource} and ${path})`);
		}
		ids.set(id, path);
		orders.set(order, path);
		scenes.push({
			id,
			order,
			component: component as () => Promise<SceneModule>
		});
	}

	return scenes.sort((a, b) => a.order - b.order);
}
