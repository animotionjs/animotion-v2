import { createSequence, type Sequence } from '#lib/scene';
import './configure';

type Entries = Record<string, () => Promise<unknown>>;

/* Every project lives here. */
const entries = import.meta.glob([
	'../../projects/*/scenes/*.svelte',
	'../../projects/*/scenes/*/scene.svelte'
]) as Entries;

/** Every project slug, e.g. `example` for `projects/example/scenes/`. */
export const projectSlugs: string[] = [
	...new Set(
		Object.keys(entries).map((path) => {
			const parts = path.split('/');
			const at = parts.lastIndexOf('projects');
			return at >= 0 && parts[at + 2] === 'scenes' ? parts[at + 1] : '';
		})
	)
]
	.filter((slug) => slug.length > 0)
	.sort();

/**
 * Builds the sequence for a project slug.
 * Unknown slugs give an empty sequence so pages can show a missing project
 * message instead of crashing on the first scene.
 */
export function sequenceFor(slug: string): Sequence {
	if (!projectSlugs.includes(slug)) return [];
	const prefix = `../../projects/${slug}/scenes/`;
	return createSequence(
		Object.fromEntries(Object.entries(entries).filter(([path]) => path.startsWith(prefix)))
	);
}
