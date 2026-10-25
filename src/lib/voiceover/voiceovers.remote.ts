import { command } from '$app/server';
import {
	deleteVoiceover,
	pruneVoiceovers,
	readVoiceoverFile,
	readVoiceoverFilters,
	readVoiceoverTrack,
	renameVoiceover,
	restoreVoiceover,
	saveVoiceover,
	saveVoiceoverFilters,
	setVoiceoverWindow,
	setVoiceoverWindows
} from '#lib/server/voiceovers.js';
import { validateProject, type VoiceoverClip, type VoiceoverTrack } from './types.js';
import { validateVoiceoverFilters, type VoiceoverFilterFile } from './filters.js';

function objectInput(input: unknown): Record<string, unknown> {
	if (typeof input !== 'object' || input === null) {
		throw new Error('Invalid voiceover request');
	}
	return input as Record<string, unknown>;
}

function projectOf(input: Record<string, unknown>): string {
	const project = input.project;
	if (typeof project !== 'string') throw new Error('Invalid voiceover project');
	validateProject(project);
	return project;
}

export const loadVoiceovers = command(
	'unchecked',
	async (input: unknown): Promise<VoiceoverTrack> => {
		return readVoiceoverTrack(projectOf(objectInput(input)));
	}
);

export const readRecordedVoiceover = command(
	'unchecked',
	async (input: unknown): Promise<string> => {
		const value = objectInput(input);
		const project = projectOf(value);
		if (typeof value.file !== 'string') throw new Error('Invalid voiceover file');
		return (await readVoiceoverFile(project, value.file)).toString('base64');
	}
);
export const saveRecordedVoiceover = command(
	'unchecked',
	async (input: unknown): Promise<VoiceoverClip> => {
		const value = objectInput(input);
		const project = projectOf(value);
		if (
			typeof value.start !== 'number' ||
			typeof value.duration !== 'number' ||
			typeof value.mime !== 'string' ||
			(value.id !== undefined && typeof value.id !== 'string') ||
			(value.label !== undefined && typeof value.label !== 'string') ||
			typeof value.data !== 'string'
		) {
			throw new Error('Invalid voiceover recording');
		}

		return saveVoiceover({
			project,
			id: typeof value.id === 'string' ? value.id : undefined,
			start: value.start,
			duration: value.duration,
			mime: value.mime,
			label: typeof value.label === 'string' ? value.label : undefined,
			data: value.data
		});
	}
);

export const setRecordedVoiceoverWindow = command(
	'unchecked',
	async (input: unknown): Promise<VoiceoverClip> => {
		const value = objectInput(input);
		const project = projectOf(value);
		if (
			typeof value.id !== 'string' ||
			typeof value.start !== 'number' ||
			typeof value.trimStart !== 'number' ||
			typeof value.duration !== 'number'
		) {
			throw new Error('Invalid voiceover window');
		}
		return setVoiceoverWindow({
			project,
			id: value.id,
			start: value.start,
			trimStart: value.trimStart,
			duration: value.duration
		});
	}
);

export const setRecordedVoiceoverWindows = command(
	'unchecked',
	async (input: unknown): Promise<VoiceoverClip[]> => {
		const value = objectInput(input);
		const project = projectOf(value);
		if (!Array.isArray(value.windows)) throw new Error('Invalid voiceover windows');
		const windows = value.windows.map((entry: unknown) => {
			if (
				typeof entry !== 'object' ||
				entry === null ||
				typeof (entry as Record<string, unknown>).id !== 'string' ||
				typeof (entry as Record<string, unknown>).start !== 'number' ||
				typeof (entry as Record<string, unknown>).trimStart !== 'number' ||
				typeof (entry as Record<string, unknown>).duration !== 'number'
			) {
				throw new Error('Invalid voiceover window');
			}
			const window = entry as { id: string; start: number; trimStart: number; duration: number };
			return {
				id: window.id,
				start: window.start,
				trimStart: window.trimStart,
				duration: window.duration
			};
		});
		return setVoiceoverWindows({ project, windows });
	}
);

export const renameRecordedVoiceover = command(
	'unchecked',
	async (input: unknown): Promise<VoiceoverClip> => {
		const value = objectInput(input);
		const project = projectOf(value);
		if (typeof value.id !== 'string' || typeof value.label !== 'string') {
			throw new Error('Invalid voiceover rename');
		}
		return renameVoiceover({ project, id: value.id, label: value.label });
	}
);

export const deleteRecordedVoiceover = command(
	'unchecked',
	async (input: unknown): Promise<void> => {
		const value = objectInput(input);
		const project = projectOf(value);
		if (typeof value.id !== 'string') throw new Error('Invalid voiceover deletion');
		await deleteVoiceover({ project, id: value.id });
	}
);

export const restoreRecordedVoiceover = command(
	'unchecked',
	async (input: unknown): Promise<VoiceoverClip> => {
		const value = objectInput(input);
		const project = projectOf(value);
		if (typeof value.clip !== 'object' || value.clip === null) {
			throw new Error('Invalid voiceover restore');
		}
		return restoreVoiceover({ project, clip: value.clip as VoiceoverClip });
	}
);

export const pruneRecordedVoiceovers = command(
	'unchecked',
	async (input: unknown): Promise<string[]> => {
		return pruneVoiceovers({ project: projectOf(objectInput(input)) });
	}
);

export const loadVoiceoverFilters = command(
	'unchecked',
	async (input: unknown): Promise<VoiceoverFilterFile> => {
		return readVoiceoverFilters(projectOf(objectInput(input)));
	}
);

export const saveVoiceoverFilterSettings = command(
	'unchecked',
	async (input: unknown): Promise<VoiceoverFilterFile> => {
		const value = objectInput(input);
		const project = projectOf(value);
		if (typeof value.filters !== 'object' || value.filters === null) {
			throw new Error('Invalid voiceover filters');
		}
		return saveVoiceoverFilters({ project, filters: validateVoiceoverFilters(value.filters) });
	}
);
