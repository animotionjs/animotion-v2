import { error } from '@sveltejs/kit';
import { command, query } from '$app/server';
import {
	createPresentation,
	listPresentations,
	renamePresentation
} from '#lib/server/presentations.js';

export const presentationList = query(async () => listPresentations());

export const presentationCreate = command('unchecked', async (input: unknown): Promise<string> => {
	if (typeof input !== 'object' || input === null) error(400, 'Invalid presentation request');
	const { name } = input as Record<string, unknown>;
	if (typeof name !== 'string') error(400, 'Presentation name is required');
	try {
		return await createPresentation(name);
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Could not create presentation');
	}
});

export const presentationRename = command('unchecked', async (input: unknown): Promise<string> => {
	if (typeof input !== 'object' || input === null) error(400, 'Invalid presentation request');
	const { slug, name } = input as Record<string, unknown>;
	if (typeof slug !== 'string' || typeof name !== 'string') {
		error(400, 'Presentation and name are required');
	}
	try {
		return await renamePresentation(slug, name);
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Could not rename presentation');
	}
});
