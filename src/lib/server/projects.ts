import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface ProjectInfo {
	/** URL safe folder name, e.g. `example`. Changes when the project is renamed. */
	slug: string;
	/** Display name, e.g. `Example`. Follows the slug on rename. */
	name: string;
	/** Number of scenes found in the project. */
	scenes: number;
}

const SCENE_PATTERN = /^\d+-.+\.svelte$/;
/* Directory form of a scene, e.g. `01-intro/scene.svelte`, counted like flat files. */
const NESTED_SCENE_DIR = /^\d+-.+$/;
const NESTED_SCENE_FILE = 'scene.svelte';
const META_FILE = 'project.json';
/* Well under filesystem and URL limits, while keeping paths readable. */
const MAX_SLUG_LENGTH = 64;

function projectsDirectory(): string {
	return resolve(process.cwd(), 'src', 'projects');
}

/** Turns a display name into a folder safe slug, or throws when nothing usable remains. */
export function slugify(name: string): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, '-')
		.replace(/[^a-z0-9-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	if (!slug) throw new Error('Project name must contain at least one letter or digit');
	if (slug.length > MAX_SLUG_LENGTH) throw new Error('Project name is too long');
	return slug;
}

function displayName(slug: string): string {
	return slug
		.split('-')
		.map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
		.join(' ');
}

/** Reads the display name manifest, falling back to the slug when missing or broken. */
async function readName(directory: string, slug: string): Promise<string> {
	try {
		const raw = await readFile(join(directory, slug, META_FILE), 'utf8');
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed === 'object' && parsed !== null && 'name' in parsed) {
			const name = (parsed as { name: unknown }).name;
			if (typeof name === 'string' && name.trim().length > 0) return name;
		}
	} catch {
		// no manifest yet, the slug doubles as the name
	}
	return displayName(slug);
}

const STARTER_SCENE = `<script lang="ts">
	import { createScene, easeInOut } from '#lib/scene';

	const scene = createScene({ opacity: 0, view: 'title' })
		.tween('opacity', 1, 0.6)
		.layout(() => (scene.view = 'logo'), 0.6, { ease: easeInOut, enter: 'scale' });
</script>

<div data-notes>What I say when this slide is on screen.</div>

<div class="text-6xl font-bold">
	{#if scene.view === 'logo'}
		<span data-layout="logo">🪄</span>
	{/if}
	<span data-layout="title" style:opacity={scene.opacity}>New project</span>
</div>
`;

/** Lists user projects, each a folder with a `scenes` directory. Missing folder means no projects yet. */
export async function listProjects(directory = projectsDirectory()): Promise<ProjectInfo[]> {
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw error;
	}
	const projects: ProjectInfo[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const scenesDir = join(directory, entry.name, 'scenes');
		let files;
		try {
			files = await readdir(scenesDir, { withFileTypes: true });
		} catch {
			continue;
		}
		let scenes = 0;
		for (const file of files) {
			if (file.isFile() && SCENE_PATTERN.test(file.name)) {
				scenes++;
			} else if (file.isDirectory() && NESTED_SCENE_DIR.test(file.name)) {
				/* Nested form: a scene living in its own folder with helpers. */
				try {
					const inner = await readdir(join(scenesDir, file.name));
					if (inner.includes(NESTED_SCENE_FILE)) scenes++;
				} catch {
					// unreadable folder, skip it like a missing scenes dir
				}
			}
		}
		projects.push({
			slug: entry.name,
			name: await readName(directory, entry.name),
			scenes
		});
	}
	return projects.sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * The default project for bare paths and renders without a project flag.
 * Prefers `example` when present, otherwise the first slug alphabetically,
 * otherwise null when there are no projects at all.
 */
export async function defaultProjectSlug(directory = projectsDirectory()): Promise<string | null> {
	const projects = await listProjects(directory);
	if (projects.some((project) => project.slug === 'example')) return 'example';
	return projects[0]?.slug ?? null;
}

/** Creates a project folder with a starter scene, returning its slug. Throws on invalid or taken names. */
export async function createProject(
	name: string,
	directory = projectsDirectory()
): Promise<string> {
	const slug = slugify(name);
	const scenes = join(directory, slug, 'scenes');
	try {
		const existing = await stat(scenes);
		if (existing.isDirectory()) throw new Error(`Project "${slug}" already exists`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
	await mkdir(scenes, { recursive: true });
	await writeFile(join(scenes, '01-intro.svelte'), STARTER_SCENE);
	await writeFile(join(directory, slug, META_FILE), `${JSON.stringify({ name: name.trim() })}\n`);
	return slug;
}

/**
 * Renames a project folder, returning the new slug. The manifest travels
 * along and is rewritten, so the display name follows the move.
 * Throws on unknown, invalid, or taken names.
 */
export async function renameProject(
	slug: string,
	name: string,
	directory = projectsDirectory()
): Promise<string> {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Unknown project');
	const next = slugify(name);
	if (next === slug) {
		/* Same slug is only a no-op when the project exists and the name is unchanged. */
		const current = join(directory, slug);
		try {
			const existing = await stat(current);
			if (!existing.isDirectory()) throw new Error('Unknown project');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Unknown project');
			throw error;
		}
		const trimmed = name.trim();
		if (trimmed !== (await readName(directory, slug))) {
			await writeFile(join(current, META_FILE), `${JSON.stringify({ name: trimmed })}\n`);
		}
		return slug;
	}
	try {
		const taken = await stat(join(directory, next));
		if (taken.isDirectory()) throw new Error(`Project "${next}" already exists`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
	try {
		await rename(join(directory, slug), join(directory, next));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT')
			throw new Error('Unknown project', { cause: error });
		throw error;
	}
	await writeFile(join(directory, next, META_FILE), `${JSON.stringify({ name: name.trim() })}\n`);
	return next;
}
