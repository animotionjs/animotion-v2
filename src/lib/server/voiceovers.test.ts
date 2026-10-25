import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	deleteVoiceover,
	flushVoiceoverWrites,
	pruneVoiceovers,
	readVoiceoverFile,
	readVoiceoverFilters,
	readVoiceoverTrack,
	renameVoiceover,
	restoreVoiceover,
	saveVoiceover,
	saveVoiceoverFilters,
	setVoiceoverWindow,
	setVoiceoverWindows,
	voiceoverFilePath
} from './voiceovers.js';
import { DEFAULT_VOICEOVER_FILTERS } from '../voiceover/filters.js';

const audio = Buffer.from('not really audio').toString('base64');

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'animotion-voiceovers-'));
	process.chdir(root);
});

afterEach(async () => {
	await flushVoiceoverWrites();
	process.chdir('/');
	await rm(root, { recursive: true, force: true });
});

describe('voiceover storage', () => {
	it('starts an unknown project with an empty track', async () => {
		expect(await readVoiceoverTrack('example')).toEqual({
			version: 1,
			project: 'example',
			clips: []
		});
	});

	it('saves, reads back and moves a clip', async () => {
		const saved = await saveVoiceover({
			project: 'example',
			start: 8,
			duration: 4.5,
			mime: 'audio/wav',
			data: audio
		});
		expect(saved.file).toBe(`${saved.id}.wav`);
		// the id names the file, so it stays short enough to read in a folder
		expect(saved.id.length).toBeLessThanOrEqual(12);

		const track = await readVoiceoverTrack('example');
		expect(track.clips).toHaveLength(1);
		expect(track.clips[0]?.start).toBe(8);
		expect((await readVoiceoverFile('example', saved.file)).toString()).toBe('not really audio');

		const moved = await setVoiceoverWindow({
			project: 'example',
			id: saved.id,
			start: 20,
			trimStart: 0,
			duration: 4.5
		});
		expect(moved.start).toBe(20);
		expect((await readVoiceoverTrack('example')).clips[0]?.start).toBe(20);
	});

	it('trims a clip without touching its file', async () => {
		const saved = await saveVoiceover({
			project: 'example',
			start: 2,
			duration: 4,
			mime: 'audio/wav',
			data: audio
		});
		// a fresh recording plays in full, so its source is its whole length
		expect(saved.trimStart).toBe(0);
		expect(saved.sourceDuration).toBe(4);

		const trimmed = await setVoiceoverWindow({
			project: 'example',
			id: saved.id,
			start: 2.5,
			trimStart: 0.5,
			duration: 2
		});
		expect(trimmed.trimStart).toBe(0.5);
		expect(trimmed.duration).toBe(2);
		expect(trimmed.sourceDuration).toBe(4);
		expect((await readVoiceoverTrack('example')).clips[0]?.trimStart).toBe(0.5);
		// the audio is untouched, which is what makes the trim reversible
		expect((await readVoiceoverFile('example', saved.file)).toString()).toBe('not really audio');
	});

	it('moves several clips in one write and keeps their files', async () => {
		const first = await saveVoiceover({
			project: 'example',
			start: 0,
			duration: 1,
			mime: 'audio/wav',
			data: audio
		});
		const second = await saveVoiceover({
			project: 'example',
			start: 3,
			duration: 1,
			mime: 'audio/wav',
			data: audio
		});

		const updated = await setVoiceoverWindows({
			project: 'example',
			windows: [
				{ id: first.id, start: 1, trimStart: 0, duration: 1 },
				{ id: second.id, start: 4, trimStart: 0, duration: 1 }
			]
		});
		expect(updated.map((clip) => clip.start)).toEqual([1, 4]);
		expect((await readVoiceoverTrack('example')).clips.map((clip) => clip.start)).toEqual([1, 4]);
		// both recordings are untouched, which is what makes a group move safe
		expect((await readVoiceoverFile('example', first.file)).toString()).toBe('not really audio');
		expect((await readVoiceoverFile('example', second.file)).toString()).toBe('not really audio');
	});

	it('refuses a group move that would overlap, leaving the track alone', async () => {
		const first = await saveVoiceover({
			project: 'example',
			start: 0,
			duration: 1,
			mime: 'audio/wav',
			data: audio
		});
		const second = await saveVoiceover({
			project: 'example',
			start: 3,
			duration: 1,
			mime: 'audio/wav',
			data: audio
		});

		await expect(
			setVoiceoverWindows({
				project: 'example',
				windows: [
					{ id: first.id, start: 3, trimStart: 0, duration: 1 },
					{ id: second.id, start: 3, trimStart: 0, duration: 1 }
				]
			})
		).rejects.toThrow(/overlap/);
		expect((await readVoiceoverTrack('example')).clips.map((clip) => clip.start)).toEqual([0, 3]);
	});

	it('refuses a trim that runs past the end of the recording', async () => {
		const saved = await saveVoiceover({
			project: 'example',
			start: 0,
			duration: 2,
			mime: 'audio/wav',
			data: audio
		});
		await expect(
			setVoiceoverWindow({
				project: 'example',
				id: saved.id,
				start: 0,
				trimStart: 1,
				duration: 2
			})
		).rejects.toThrow();
	});

	it('lets a clip run past the end of any scene', async () => {
		const saved = await saveVoiceover({
			project: 'example',
			start: 2,
			duration: 600,
			mime: 'audio/wav',
			data: audio
		});
		expect(saved.start + saved.duration).toBe(602);
	});

	it('refuses an overlap but allows a clip that only touches', async () => {
		await saveVoiceover({
			project: 'example',
			start: 0,
			duration: 5,
			mime: 'audio/wav',
			data: audio
		});
		await expect(
			saveVoiceover({ project: 'example', start: 4, duration: 2, mime: 'audio/wav', data: audio })
		).rejects.toThrow(/overlap/);
		await expect(
			saveVoiceover({ project: 'example', start: 5, duration: 2, mime: 'audio/wav', data: audio })
		).resolves.toBeDefined();
	});

	it('keeps projects apart', async () => {
		await saveVoiceover({ project: 'one', start: 0, duration: 1, mime: 'audio/wav', data: audio });
		expect((await readVoiceoverTrack('two')).clips).toEqual([]);
	});

	it('deletes the clip but keeps its file for an undo', async () => {
		const saved = await saveVoiceover({
			project: 'example',
			start: 1,
			duration: 1,
			mime: 'audio/wav',
			data: audio
		});
		const path = voiceoverFilePath('example', saved.file);
		const removed = await deleteVoiceover({ project: 'example', id: saved.id });
		expect((await readVoiceoverTrack('example')).clips).toEqual([]);
		// the clip comes back so the caller can undo the delete
		expect(removed?.id).toBe(saved.id);
		expect(removed?.file).toBe(saved.file);
		// the audio is still on disk, which is what makes the undo possible
		expect((await readFile(path)).toString()).toBe('not really audio');
	});

	it('puts a deleted clip back on undo', async () => {
		const saved = await saveVoiceover({
			project: 'example',
			start: 1,
			duration: 1,
			mime: 'audio/wav',
			data: audio
		});
		const removed = await deleteVoiceover({ project: 'example', id: saved.id });
		expect(removed).not.toBeNull();
		if (!removed) return;

		const restored = await restoreVoiceover({ project: 'example', clip: removed });
		expect(restored.id).toBe(saved.id);
		expect((await readVoiceoverTrack('example')).clips).toHaveLength(1);
		expect((await readVoiceoverFile('example', saved.file)).toString()).toBe('not really audio');
	});

	it('refuses to restore against a missing file', async () => {
		const saved = await saveVoiceover({
			project: 'example',
			start: 1,
			duration: 1,
			mime: 'audio/wav',
			data: audio
		});
		const removed = await deleteVoiceover({ project: 'example', id: saved.id });
		if (!removed) throw new Error('the delete returned nothing');
		// the next prune takes the audio of the delete that was never undone
		await pruneVoiceovers({ project: 'example' });
		await expect(restoreVoiceover({ project: 'example', clip: removed })).rejects.toThrow();
	});

	it('removes the file of a delete that was never undone when the project prunes', async () => {
		const saved = await saveVoiceover({
			project: 'example',
			start: 1,
			duration: 1,
			mime: 'audio/wav',
			data: audio
		});
		const path = voiceoverFilePath('example', saved.file);
		await deleteVoiceover({ project: 'example', id: saved.id });
		await pruneVoiceovers({ project: 'example' });
		await expect(readFile(path)).rejects.toThrow();
	});

	it('prunes audio a delete left behind and keeps the rest', async () => {
		const kept = await saveVoiceover({
			project: 'example',
			start: 0,
			duration: 1,
			mime: 'audio/wav',
			data: audio
		});
		const dropped = await saveVoiceover({
			project: 'example',
			start: 2,
			duration: 1,
			mime: 'audio/wav',
			data: audio
		});
		// a delete leaves the file on disk, with the clip gone from the track
		await deleteVoiceover({ project: 'example', id: dropped.id });

		const removed = await pruneVoiceovers({ project: 'example' });
		expect(removed).toEqual([dropped.file]);
		await expect(readFile(voiceoverFilePath('example', dropped.file))).rejects.toThrow();
		// the listed clip keeps its audio
		expect((await readFile(voiceoverFilePath('example', kept.file))).toString()).toBe(
			'not really audio'
		);
	});

	it('prunes nothing when the folder is already tidy', async () => {
		await saveVoiceover({
			project: 'example',
			start: 0,
			duration: 1,
			mime: 'audio/wav',
			data: audio
		});
		expect(await pruneVoiceovers({ project: 'example' })).toEqual([]);
	});

	it('prunes an empty project without failing', async () => {
		expect(await pruneVoiceovers({ project: 'empty' })).toEqual([]);
	});

	it('keeps a clip that is saved at the same time as a prune', async () => {
		// both go through the same queue, so a save cannot be half seen by a prune
		const saving = saveVoiceover({
			project: 'example',
			start: 0,
			duration: 1,
			mime: 'audio/wav',
			data: audio
		});
		const pruning = pruneVoiceovers({ project: 'example' });
		const [saved] = await Promise.all([saving, pruning]);

		const track = await readVoiceoverTrack('example');
		expect(track.clips.map((clip) => clip.id)).toEqual([saved.id]);
		expect((await readVoiceoverFile('example', saved.file)).toString()).toBe('not really audio');
	});

	it('serializes two saves so neither track write is lost', async () => {
		const first = saveVoiceover({
			project: 'example',
			start: 0,
			duration: 1,
			mime: 'audio/wav',
			data: audio
		});
		const second = saveVoiceover({
			project: 'example',
			start: 2,
			duration: 1,
			mime: 'audio/wav',
			data: audio
		});
		const [a, b] = await Promise.all([first, second]);

		const track = await readVoiceoverTrack('example');
		expect(track.clips.map((clip) => clip.id).sort()).toEqual([a.id, b.id].sort());
	});

	it('renames a clip without touching its file', async () => {
		const saved = await saveVoiceover({
			project: 'example',
			start: 1,
			duration: 1,
			mime: 'audio/wav',
			label: 'Recording 1',
			data: audio
		});
		const renamed = await renameVoiceover({
			project: 'example',
			id: saved.id,
			label: 'intro narration'
		});
		expect(renamed.label).toBe('intro narration');
		// every field but the label is left exactly as it was
		expect(renamed.file).toBe(saved.file);
		expect(renamed.start).toBe(saved.start);
		expect(renamed.duration).toBe(saved.duration);
		expect((await readVoiceoverTrack('example')).clips[0]?.label).toBe('intro narration');
		expect((await readVoiceoverFile('example', saved.file)).toString()).toBe('not really audio');
	});

	it('refuses to rename a clip that is not there', async () => {
		await expect(
			renameVoiceover({ project: 'example', id: 'missing', label: 'anything' })
		).rejects.toThrow(/not found/);
	});

	it('rejects a rename that is empty or too long', async () => {
		const saved = await saveVoiceover({
			project: 'example',
			start: 1,
			duration: 1,
			mime: 'audio/wav',
			label: 'Recording 1',
			data: audio
		});
		await expect(renameVoiceover({ project: 'example', id: saved.id, label: '' })).rejects.toThrow(
			/label/
		);
		await expect(
			renameVoiceover({ project: 'example', id: saved.id, label: 'x'.repeat(81) })
		).rejects.toThrow(/label/);
		// the failed attempts leave the original name in place
		expect((await readVoiceoverTrack('example')).clips[0]?.label).toBe('Recording 1');
	});

	it('keeps the other clips untouched when one is renamed', async () => {
		const first = await saveVoiceover({
			project: 'example',
			start: 0,
			duration: 1,
			mime: 'audio/wav',
			label: 'first',
			data: audio
		});
		const second = await saveVoiceover({
			project: 'example',
			start: 2,
			duration: 1,
			mime: 'audio/wav',
			label: 'second',
			data: audio
		});
		await renameVoiceover({ project: 'example', id: second.id, label: 'renamed' });
		const clips = (await readVoiceoverTrack('example')).clips;
		expect(clips.find((clip) => clip.id === first.id)?.label).toBe('first');
		expect(clips.find((clip) => clip.id === second.id)?.label).toBe('renamed');
	});

	it('rejects an empty recording', async () => {
		await expect(
			saveVoiceover({ project: 'example', start: 0, duration: 1, mime: 'audio/wav', data: '' })
		).rejects.toThrow(/empty/);
	});
});

describe('voiceover filters', () => {
	it('starts an unknown project with the defaults', async () => {
		const file = await readVoiceoverFilters('example');
		expect(file).toEqual({ version: 1, project: 'example', filters: DEFAULT_VOICEOVER_FILTERS });
	});

	it('saves and reads back a chain', async () => {
		const filters = { ...DEFAULT_VOICEOVER_FILTERS, gain: { enabled: true, db: 5 } };
		const saved = await saveVoiceoverFilters({ project: 'example', filters });
		expect(saved.filters.gain.db).toBe(5);
		expect((await readVoiceoverFilters('example')).filters.gain.db).toBe(5);
	});

	it('rejects values outside the bounds', async () => {
		await expect(
			saveVoiceoverFilters({
				project: 'example',
				filters: { ...DEFAULT_VOICEOVER_FILTERS, gain: { enabled: true, db: 99 } }
			})
		).rejects.toThrow();
		// the failed write leaves the previous chain in place
		expect((await readVoiceoverFilters('example')).filters.gain.db).toBe(
			DEFAULT_VOICEOVER_FILTERS.gain.db
		);
	});
});
