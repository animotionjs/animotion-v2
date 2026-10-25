import type { ProjectDefinition } from '../canvas/project.js';
import type { SceneEntry, Sequence } from '../scene/runtime/sequence.js';

const entries = import.meta.glob('../../projects/*/project.ts', { eager: true }) as Record<
	string,
	{ default: ProjectDefinition }
>;

/** Every project slug, e.g. `example` for `projects/example/`. */
export const projectSlugs: string[] = Object.keys(entries)
	.map((path) => path.split('/').at(-2) ?? '')
	.filter(Boolean)
	.sort();

export function projectFor(slug: string): ProjectDefinition | null {
	return entries[`../../projects/${slug}/project.ts`]?.default ?? null;
}

/** Builds the editor sequence for a canvas project. */
export function sequenceFor(slug: string): Sequence {
	const project = projectFor(slug);
	if (!project) return [];

	return project.scenes.map((definition, index): SceneEntry => ({
		id: definition.id,
		order: index,
		definition,
		chapter: definition.chapter,
		notes: definition.notes,
		width: project.size.width,
		height: project.size.height,
		background: project.background
	}));
}

const listeners = new Set<() => void>();

/** Runs `fn` when a project or scene file changes in development. */
export function onScenesChanged(fn: () => void) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

/** Tells every listener that a project file changed; used by HMR and tests. */
export function notifyScenesChanged() {
	for (const listener of listeners) listener();
}

if (import.meta.hot) {
	import.meta.hot.on('vite:afterUpdate', (payload) => {
		const changed = payload.updates.some((update) => /\/projects\/.*\.ts$/.test(update.path));
		if (changed) notifyScenesChanged();
	});
}
