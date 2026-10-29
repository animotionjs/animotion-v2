import { createSequence, type Sequence, type SvelteSceneModule } from '#lib/slides/sequence.js';

type MarkdownEntries = Record<string, string>;

/* Every presentation lives here. */
const svelteEntries = import.meta.glob(
	['../../presentations/*/scenes/*.svelte', '../../presentations/*/scenes/*/scene.svelte'],
	{ eager: true }
) as Record<string, SvelteSceneModule>;

const markdownEntries = import.meta.glob(
	['../../presentations/*/scenes/*.md', '../../presentations/*/scenes/*/scene.md'],
	{ query: '?raw', import: 'default', eager: true }
) as MarkdownEntries;

function presentationOf(path: string): string {
	const parts = path.split('/');
	const at = parts.lastIndexOf('presentations');
	return at >= 0 && parts[at + 2] === 'scenes' ? (parts[at + 1] ?? '') : '';
}

/** Every presentation slug, e.g. `example` for `presentations/example/scenes/`. */
export const presentationSlugs: string[] = [
	...new Set([...Object.keys(svelteEntries), ...Object.keys(markdownEntries)].map(presentationOf))
]
	.filter((slug) => slug.length > 0)
	.sort();

/**
 * Builds the sequence for a presentation slug.
 * Unknown slugs give an empty sequence so the page can show a message instead
 * of crashing on the first scene.
 */
export function sequenceFor(slug: string): Sequence {
	if (!presentationSlugs.includes(slug)) return [];
	const prefix = `../../presentations/${slug}/scenes/`;
	const svelte = Object.fromEntries(
		Object.entries(svelteEntries).filter(([path]) => path.startsWith(prefix))
	);
	const markdown = Object.fromEntries(
		Object.entries(markdownEntries).filter(([path]) => path.startsWith(prefix))
	);
	return createSequence(svelte, markdown);
}

/* The default route opens this presentation when no slug is given. */
export const defaultSequence: Sequence = sequenceFor(
	presentationSlugs.includes('example') ? 'example' : (presentationSlugs[0] ?? '')
);
