import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The store talks to the server through remote commands, which cannot run here
 * and would write real files. A fake track stands in, so the history is tested
 * without touching a project.
 */
const clips = new Map<string, VoiceoverClip>();
let failNextMove = false;

vi.mock('../voiceover/voiceovers.remote.js', () => ({
	loadVoiceovers: async () => ({ version: 1, project: 'test', clips: [...clips.values()] }),
	pruneRecordedVoiceovers: async () => [],
	readRecordedVoiceover: async () => 'not really audio',
	loadVoiceoverFilters: async () => ({
		version: 1,
		project: 'test',
		filters: DEFAULT_VOICEOVER_FILTERS
	}),
	saveVoiceoverFilterSettings: async () => ({
		version: 1,
		project: 'test',
		filters: DEFAULT_VOICEOVER_FILTERS
	}),
	saveRecordedVoiceover: async () => {
		throw new Error('not used in these tests');
	},
	setRecordedVoiceoverWindow: async ({
		id,
		start,
		trimStart,
		duration
	}: {
		id: string;
		start: number;
		trimStart: number;
		duration: number;
	}) => {
		if (failNextMove) {
			failNextMove = false;
			throw new Error('The recording overlaps another one.');
		}
		const clip = clips.get(id);
		if (!clip) throw new Error('Voiceover recording was not found');
		const moved = { ...clip, start, trimStart, duration };
		clips.set(id, moved);
		return moved;
	},
	setRecordedVoiceoverWindows: async ({
		windows
	}: {
		windows: readonly { id: string; start: number; trimStart: number; duration: number }[];
	}) => {
		if (failNextMove) {
			failNextMove = false;
			throw new Error('The recording overlaps another one.');
		}
		const updated: VoiceoverClip[] = [];
		for (const window of windows) {
			const clip = clips.get(window.id);
			if (!clip) throw new Error('Voiceover recording was not found');
			const moved = {
				...clip,
				start: window.start,
				trimStart: window.trimStart,
				duration: window.duration
			};
			clips.set(window.id, moved);
			updated.push(moved);
		}
		return updated;
	},
	renameRecordedVoiceover: async ({ id, label }: { id: string; label: string }) => {
		const clip = clips.get(id);
		if (!clip) throw new Error('Voiceover recording was not found');
		const renamed = { ...clip, label };
		clips.set(id, renamed);
		return renamed;
	},
	deleteRecordedVoiceover: async ({ id }: { id: string }) => {
		clips.delete(id);
	},
	restoreRecordedVoiceover: async ({ clip }: { clip: VoiceoverClip }) => {
		clips.set(clip.id, clip);
		return clip;
	}
}));

import { EditorVoiceover } from './voiceover.svelte.js';
import { EditorController } from './controller.svelte.js';
import { DEFAULT_VOICEOVER_FILTERS } from '../voiceover/filters.js';
import type { SceneEntry, Sequence } from '../scene/runtime/sequence.js';
import type { VoiceoverClip } from '../voiceover/types.js';

function sequence(): Sequence {
	return [
		{
			id: 'one',
			order: 1,
			component: () => Promise.resolve({ default: null as never })
		}
	] satisfies SceneEntry[];
}

function clip(id: string, start: number, label = `clip ${id}`): VoiceoverClip {
	return {
		id,
		label,
		file: `${id}.wav`,
		start,
		duration: 1,
		trimStart: 0,
		sourceDuration: 1,
		mime: 'audio/wav'
	};
}

function win(start: number, duration = 1, trimStart = 0) {
	return { start, duration, trimStart };
}

/** The editor store with one clip already in its track. */
async function editorWith(...seed: VoiceoverClip[]) {
	clips.clear();
	for (const item of seed) clips.set(item.id, item);
	const controller = new EditorController(sequence(), 60);
	const voiceover = new EditorVoiceover(controller, 'test');
	await voiceover.start();
	return { controller, voiceover };
}

describe('voiceover undo history', () => {
	beforeEach(() => {
		failNextMove = false;
	});

	it('moves a clip and takes the move back', async () => {
		const { voiceover } = await editorWith(clip('a', 0));
		expect(voiceover.canUndo).toBe(false);

		await voiceover.commit('a', win(3));
		expect(voiceover.clips[0]?.start).toBe(3);
		expect(voiceover.canUndo).toBe(true);
		expect(voiceover.canRedo).toBe(false);

		await voiceover.undo();
		expect(voiceover.clips[0]?.start).toBe(0);
		expect(voiceover.canUndo).toBe(false);
		expect(voiceover.canRedo).toBe(true);

		await voiceover.redo();
		expect(voiceover.clips[0]?.start).toBe(3);
		expect(voiceover.canUndo).toBe(true);
		expect(voiceover.canRedo).toBe(false);
	});

	it('trims a clip and takes the trim back', async () => {
		const { voiceover } = await editorWith(clip('a', 0));
		await voiceover.commit('a', win(0.25, 0.5, 0.25));
		expect(voiceover.clips[0]?.trimStart).toBe(0.25);
		expect(voiceover.clips[0]?.duration).toBe(0.5);
		expect(voiceover.canUndo).toBe(true);

		await voiceover.undo();
		expect(voiceover.clips[0]?.trimStart).toBe(0);
		expect(voiceover.clips[0]?.duration).toBe(1);

		await voiceover.redo();
		expect(voiceover.clips[0]?.trimStart).toBe(0.25);
		expect(voiceover.clips[0]?.duration).toBe(0.5);
	});

	it('renames a clip and takes the rename back', async () => {
		const { voiceover } = await editorWith(clip('a', 0, 'first'));
		await voiceover.rename('a', 'second');
		expect(voiceover.clips[0]?.label).toBe('second');

		await voiceover.undo();
		expect(voiceover.clips[0]?.label).toBe('first');

		await voiceover.redo();
		expect(voiceover.clips[0]?.label).toBe('second');
	});

	it('deletes a clip and puts it back with its audio', async () => {
		const { voiceover } = await editorWith(clip('a', 0));
		await voiceover.remove('a');
		expect(voiceover.clips).toHaveLength(0);
		expect(voiceover.canUndo).toBe(true);

		await voiceover.undo();
		expect(voiceover.clips.map((item) => item.id)).toEqual(['a']);
		// the undo selects the restored clip, so the action is visible
		expect(voiceover.selectedId).toBe('a');

		await voiceover.redo();
		expect(voiceover.clips).toHaveLength(0);
	});

	it('keeps the step when a replay is rejected, so it can be retried', async () => {
		const { voiceover } = await editorWith(clip('a', 0));
		await voiceover.commit('a', win(3));
		expect(voiceover.canUndo).toBe(true);

		// the server refuses this one, which used to consume the step instead
		failNextMove = true;
		await voiceover.undo();
		expect(voiceover.canUndo).toBe(true);
		expect(voiceover.clips[0]?.start).toBe(3);

		// the retry lands, because the step was never dropped
		await voiceover.undo();
		expect(voiceover.clips[0]?.start).toBe(0);
		expect(voiceover.canUndo).toBe(false);
		expect(voiceover.canRedo).toBe(true);
	});

	it('selects one clip, toggles and extends to a range', async () => {
		const { voiceover } = await editorWith(clip('a', 0), clip('b', 3), clip('c', 6));
		voiceover.select('a');
		expect(voiceover.selection.map((item) => item.id)).toEqual(['a']);

		voiceover.toggle('b');
		expect(voiceover.selection.map((item) => item.id)).toEqual(['a', 'b']);

		voiceover.toggle('a');
		expect(voiceover.selection.map((item) => item.id)).toEqual(['b']);

		// a range is taken in track order, wherever the anchor sits
		voiceover.selectRange('a', 'c');
		expect(voiceover.selection.map((item) => item.id)).toEqual(['a', 'b', 'c']);
		voiceover.selectRange('c', 'a');
		expect(voiceover.selection.map((item) => item.id)).toEqual(['a', 'b', 'c']);
	});

	it('moves several clips together and takes the move back as one step', async () => {
		const { voiceover } = await editorWith(clip('a', 0), clip('b', 3));
		const windows = [
			{ id: 'a', ...win(1) },
			{ id: 'b', ...win(4) }
		];
		await voiceover.commitMany(windows);
		expect(voiceover.clips.map((item) => item.start)).toEqual([1, 4]);

		await voiceover.undo();
		expect(voiceover.clips.map((item) => item.start)).toEqual([0, 3]);
		expect(voiceover.canUndo).toBe(false);

		await voiceover.redo();
		expect(voiceover.clips.map((item) => item.start)).toEqual([1, 4]);
	});

	it('deletes several clips together and brings them all back', async () => {
		const { voiceover } = await editorWith(clip('a', 0), clip('b', 3), clip('c', 6));
		await voiceover.removeMany(['a', 'c']);
		expect(voiceover.clips.map((item) => item.id)).toEqual(['b']);
		// the restore reselects the group, so the effect is visible
		expect(voiceover.canUndo).toBe(true);

		await voiceover.undo();
		expect(voiceover.selection.map((item) => item.id)).toEqual(['a', 'c']);

		await voiceover.redo();
		expect(voiceover.clips.map((item) => item.id)).toEqual(['b']);
	});

	it('does not record a group move that would overlap', async () => {
		const { voiceover } = await editorWith(clip('a', 0), clip('b', 3));
		// a lands on top of b, which the overlap check refuses
		const windows = [
			{ id: 'a', ...win(3) },
			{ id: 'b', ...win(3) }
		];
		await voiceover.commitMany(windows);
		expect(voiceover.canUndo).toBe(false);
		expect(voiceover.clips.map((item) => item.start)).toEqual([0, 3]);
	});

	it('clears redo when a new edit follows an undo', async () => {
		const { voiceover } = await editorWith(clip('a', 0), clip('b', 5));
		await voiceover.commit('a', win(3));
		await voiceover.undo();
		expect(voiceover.canRedo).toBe(true);

		await voiceover.commit('b', win(6));
		expect(voiceover.canRedo).toBe(false);
	});

	it('does not record a failed move as history', async () => {
		const { voiceover } = await editorWith(clip('a', 0));
		failNextMove = true;
		await voiceover.commit('a', win(3));
		expect(voiceover.canUndo).toBe(false);
		expect(voiceover.clips[0]?.start).toBe(0);
	});

	it('drops the oldest step once the history is full', async () => {
		const { voiceover } = await editorWith(clip('a', 0));
		for (let index = 1; index <= 51; index++) {
			await voiceover.commit('a', win(index));
		}
		expect(voiceover.canUndo).toBe(true);

		// 50 steps are kept, so 50 undos return to the very first position
		for (let index = 0; index < 50; index++) await voiceover.undo();
		expect(voiceover.canUndo).toBe(false);
		expect(voiceover.clips[0]?.start).toBe(1);
	});
});
