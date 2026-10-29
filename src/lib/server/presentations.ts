import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface PresentationInfo {
	/** URL safe folder name, e.g. `example`. Changes when the presentation is renamed. */
	slug: string;
	/** Display name, e.g. `Example`. Follows the slug on rename. */
	name: string;
	/** Number of scenes found in the presentation. */
	scenes: number;
}

const SCENE_PATTERN = /^\d+-.+\.(svelte|md)$/;
/* Directory form of a scene, e.g. `01-intro/scene.svelte`, counted like flat files. */
const NESTED_SCENE_DIR = /^\d+-.+$/;
const NESTED_SCENE_FILES = ['scene.svelte', 'scene.md'];
const META_FILE = 'presentation.json';
/* Well under filesystem and URL limits, while keeping paths readable. */
const MAX_SLUG_LENGTH = 64;

function presentationsDirectory(): string {
	return resolve(process.cwd(), 'src', 'presentations');
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
	if (!slug) throw new Error('Presentation name must contain at least one letter or digit');
	if (slug.length > MAX_SLUG_LENGTH) throw new Error('Presentation name is too long');
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

const STARTER_SCENE = `<div class="flex h-full flex-col items-center justify-center gap-8 p-20 text-center">
	<h1 data-layout="title" class="text-8xl font-bold">New presentation</h1>
	<p data-layout="hint" data-step="1" class="text-3xl text-white/60">Press the right arrow</p>
</div>
`;

/** Lists user presentations, each a folder with a `scenes` directory. Missing folder means no presentations yet. */
export async function listPresentations(
	directory = presentationsDirectory()
): Promise<PresentationInfo[]> {
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw error;
	}
	const presentations: PresentationInfo[] = [];
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
					if (NESTED_SCENE_FILES.some((name) => inner.includes(name))) scenes++;
				} catch {
					// unreadable folder, skip it like a missing scenes dir
				}
			}
		}
		presentations.push({
			slug: entry.name,
			name: await readName(directory, entry.name),
			scenes
		});
	}
	return presentations.sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * The default presentation for bare paths. Prefers `example` when present,
 * otherwise the first slug alphabetically, otherwise null.
 */
export async function defaultPresentationSlug(
	directory = presentationsDirectory()
): Promise<string | null> {
	const presentations = await listPresentations(directory);
	if (presentations.some((presentation) => presentation.slug === 'example')) return 'example';
	return presentations[0]?.slug ?? null;
}

/** Creates a presentation folder with a starter scene, returning its slug. Throws on invalid or taken names. */
export async function createPresentation(
	name: string,
	directory = presentationsDirectory()
): Promise<string> {
	const slug = slugify(name);
	const scenes = join(directory, slug, 'scenes');
	try {
		const existing = await stat(scenes);
		if (existing.isDirectory()) throw new Error(`Presentation "${slug}" already exists`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
	await mkdir(scenes, { recursive: true });
	await writeFile(join(scenes, '01-intro.svelte'), STARTER_SCENE);
	await writeFile(join(directory, slug, META_FILE), `${JSON.stringify({ name: name.trim() })}\n`);
	return slug;
}

/**
 * Renames a presentation folder, returning the new slug. The manifest travels
 * along and is rewritten, so the display name follows the move.
 * Throws on unknown, invalid, or taken names.
 */
export async function renamePresentation(
	slug: string,
	name: string,
	directory = presentationsDirectory()
): Promise<string> {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Unknown presentation');
	const next = slugify(name);
	if (next === slug) {
		/* Same slug is only a no-op when the presentation exists and the name is unchanged. */
		const current = join(directory, slug);
		try {
			const existing = await stat(current);
			if (!existing.isDirectory()) throw new Error('Unknown presentation');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT')
				throw new Error('Unknown presentation', { cause: error });
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
		if (taken.isDirectory()) throw new Error(`Presentation "${next}" already exists`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
	try {
		await rename(join(directory, slug), join(directory, next));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT')
			throw new Error('Unknown presentation', { cause: error });
		throw error;
	}
	await writeFile(join(directory, next, META_FILE), `${JSON.stringify({ name: name.trim() })}\n`);
	return next;
}
