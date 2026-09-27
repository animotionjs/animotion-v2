import { error } from '@sveltejs/kit';
import { command, query } from '$app/server';
import { createProject, listProjects, renameProject } from '#lib/server/projects.js';

export const projectList = query(async () => listProjects());

export const projectCreate = command('unchecked', async (input: unknown): Promise<string> => {
	if (typeof input !== 'object' || input === null) error(400, 'Invalid project request');
	const { name } = input as Record<string, unknown>;
	if (typeof name !== 'string') error(400, 'Project name is required');
	try {
		return await createProject(name);
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Could not create project');
	}
});

export const projectRename = command('unchecked', async (input: unknown): Promise<string> => {
	if (typeof input !== 'object' || input === null) error(400, 'Invalid project request');
	const { slug, name } = input as Record<string, unknown>;
	if (typeof slug !== 'string' || typeof name !== 'string') {
		error(400, 'Project and name are required');
	}
	try {
		return await renameProject(slug, name);
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Could not rename project');
	}
});
