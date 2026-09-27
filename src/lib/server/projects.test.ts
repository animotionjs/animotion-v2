import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	createProject,
	defaultProjectSlug,
	listProjects,
	renameProject,
	slugify
} from './projects.ts';

describe('slugify', () => {
	it('lowercases and dashes names', () => {
		expect(slugify('Example')).toBe('example');
		expect(slugify('  demo_01  ')).toBe('demo-01');
	});

	it('rejects names with nothing usable', () => {
		expect(() => slugify('!!!')).toThrow();
		expect(() => slugify('')).toThrow();
	});
});

describe('projects', () => {
	it('lists nothing when the folder is missing', async () => {
		expect(await listProjects(join(tmpdir(), 'animotion-nope'))).toEqual([]);
	});

	it('creates a starter scene and lists the project', async () => {
		const root = await mkdtemp(join(tmpdir(), 'animotion-projects-'));
		try {
			expect(await listProjects(root)).toEqual([]);
			const slug = await createProject('Example', root);
			expect(slug).toBe('example');
			expect(await listProjects(root)).toEqual([
				{ slug: 'example', name: 'Example', scenes: 1 }
			]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('rejects duplicate names', async () => {
		const root = await mkdtemp(join(tmpdir(), 'animotion-projects-'));
		try {
			await createProject('Demo', root);
			await expect(createProject('Demo', root)).rejects.toThrow('already exists');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('renames a project folder and keeps its display name', async () => {
		const root = await mkdtemp(join(tmpdir(), 'animotion-projects-'));
		try {
			await createProject('Demo', root);
			expect(await renameProject('demo', 'Example', root)).toBe('example');
			expect(await listProjects(root)).toEqual([
				{ slug: 'example', name: 'Example', scenes: 1 }
			]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('counts nested scenes living in their own folder', async () => {
		const root = await mkdtemp(join(tmpdir(), 'animotion-projects-'));
		try {
			await createProject('Demo', root);
			const nested = join(root, 'demo', 'scenes', '02-deep');
			await mkdir(nested, { recursive: true });
			await writeFile(join(nested, 'scene.svelte'), '<p>deep</p>');
			expect(await listProjects(root)).toEqual([
				{ slug: 'demo', name: 'Demo', scenes: 2 }
			]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('keeps a same slug rename honest', async () => {
		const root = await mkdtemp(join(tmpdir(), 'animotion-projects-'));
		try {
			await createProject('Demo', root);
			expect(await renameProject('demo', 'Demo', root)).toBe('demo');
			expect(await renameProject('demo', 'Demo!', root)).toBe('demo');
			expect(await listProjects(root)).toEqual([
				{ slug: 'demo', name: 'Demo!', scenes: 1 }
			]);
			await expect(renameProject('missing', 'missing', root)).rejects.toThrow(
				'Unknown project'
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('refuses bad renames', async () => {
		const root = await mkdtemp(join(tmpdir(), 'animotion-projects-'));
		try {
			await createProject('Demo', root);
			await createProject('Other', root);
			await expect(renameProject('demo', 'Other', root)).rejects.toThrow('already exists');
			await expect(renameProject('missing', 'Fresh', root)).rejects.toThrow('Unknown project');
			await expect(renameProject('demo', '!!!', root)).rejects.toThrow();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('treats every project the same, example included', async () => {
		const root = await mkdtemp(join(tmpdir(), 'animotion-projects-'));
		try {
			await createProject('Example', root);
			expect(await renameProject('example', 'Demo', root)).toBe('demo');
			expect(await listProjects(root)).toEqual([{ slug: 'demo', name: 'Demo', scenes: 1 }]);
			expect(await defaultProjectSlug(root)).toBe('demo');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('prefers example for the default and falls back gracefully', async () => {
		const root = await mkdtemp(join(tmpdir(), 'animotion-projects-'));
		try {
			expect(await defaultProjectSlug(root)).toBeNull();
			await createProject('Zulu', root);
			await createProject('Alpha', root);
			expect(await defaultProjectSlug(root)).toBe('alpha');
			await createProject('Example', root);
			expect(await defaultProjectSlug(root)).toBe('example');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
