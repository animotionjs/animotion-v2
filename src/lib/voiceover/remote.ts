import { command } from '$app/server';
import {
	deleteVoiceover,
	moveVoiceover,
	readVoiceoverFile,
	readVoiceoverManifest,
	saveVoiceover
} from '#lib/server/voiceovers.js';
import { validateSceneId, type VoiceoverClip, type VoiceoverManifest } from './types.js';

function objectInput(input: unknown): Record<string, unknown> {
	if (typeof input !== 'object' || input === null) {
		throw new Error('Invalid voiceover request');
	}
	return input as Record<string, unknown>;
}

function sceneIdOf(input: Record<string, unknown>): string {
	const sceneId = input.sceneId;
	if (typeof sceneId !== 'string') throw new Error('Invalid voiceover scene id');
	validateSceneId(sceneId);
	return sceneId;
}

export const loadVoiceovers = command(
	'unchecked',
	async (input: unknown): Promise<VoiceoverManifest> => {
		return readVoiceoverManifest(sceneIdOf(objectInput(input)));
	}
);

export const readRecordedVoiceover = command(
	'unchecked',
	async (input: unknown): Promise<string> => {
		const value = objectInput(input);
		const sceneId = sceneIdOf(value);
		if (typeof value.file !== 'string') throw new Error('Invalid voiceover file');
		return (await readVoiceoverFile(sceneId, value.file)).toString('base64');
	}
);

export const saveRecordedVoiceover = command(
	'unchecked',
	async (input: unknown): Promise<VoiceoverClip> => {
		const value = objectInput(input);
		const sceneId = sceneIdOf(value);
		if (
			typeof value.id !== 'string' ||
			typeof value.timelineFps !== 'number' ||
			typeof value.start !== 'number' ||
			typeof value.duration !== 'number' ||
			typeof value.mime !== 'string' ||
			(value.label !== undefined && typeof value.label !== 'string') ||
			typeof value.data !== 'string'
		) {
			throw new Error('Invalid voiceover recording');
		}

		return saveVoiceover({
			sceneId,
			id: value.id,
			timelineFps: value.timelineFps,
			start: value.start,
			duration: value.duration,
			mime: value.mime,
			label: typeof value.label === 'string' ? value.label : undefined,
			data: value.data
		});
	}
);

export const moveRecordedVoiceover = command(
	'unchecked',
	async (input: unknown): Promise<VoiceoverClip> => {
		const value = objectInput(input);
		const sceneId = sceneIdOf(value);
		if (typeof value.id !== 'string' || typeof value.start !== 'number') {
			throw new Error('Invalid voiceover move');
		}
		return moveVoiceover({ sceneId, id: value.id, start: value.start });
	}
);

export const deleteRecordedVoiceover = command(
	'unchecked',
	async (input: unknown): Promise<void> => {
		const value = objectInput(input);
		const sceneId = sceneIdOf(value);
		if (typeof value.id !== 'string') throw new Error('Invalid voiceover deletion');
		await deleteVoiceover({ sceneId, id: value.id });
	}
);
