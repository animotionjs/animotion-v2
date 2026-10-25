import { describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

/*
 * The store talks to the server through remote commands, which cannot run here
 * and would write real files. A fake track stands in, so a drag can be tested
 * without a project.
 */
const clips = new Map<string, VoiceoverClip>();

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
		throw new Error('not used in this test');
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

import EditorTimeline from './EditorTimeline.svelte';
import { EditorController } from './controller.svelte.js';
import { EditorVoiceover } from './voiceover.svelte.js';
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

function clip(id: string, start: number): VoiceoverClip {
	return {
		id,
		label: id,
		file: `${id}.wav`,
		start,
		duration: 1,
		trimStart: 0,
		sourceDuration: 1,
		mime: 'audio/wav'
	};
}

async function editorWith(...seed: VoiceoverClip[]) {
	clips.clear();
	for (const item of seed) clips.set(item.id, item);
	const controller = new EditorController(sequence(), 30);
	const voiceover = new EditorVoiceover(controller, 'test');
	await voiceover.start();
	return { controller, voiceover };
}

function pointer(type: string, clientX: number) {
	const event = new Event(type, { bubbles: true });
	(event as Event & { clientX: number }).clientX = clientX;
	(event as Event & { pointerId: number }).pointerId = 1;
	return event;
}

describe('EditorTimeline clip dragging', () => {
	it('slides a clip to the left as well as to the right', async () => {
		const { controller, voiceover } = await editorWith(clip('a', 3));
		const app = mount(EditorTimeline, { target: document.body, props: { controller, voiceover } });
		flushSync();
		// a fixed zoom keeps the pixel math in the test independent of layout
		controller.setPps(240);
		flushSync();

		const clipElement = document.querySelector<HTMLElement>('[role="button"]');
		expect(clipElement).not.toBeNull();

		// grab five pixels into the clip, then drag it two seconds to the left
		clipElement!.dispatchEvent(pointer('pointerdown', controller.xAtTime(3) + 5));
		flushSync();
		window.dispatchEvent(pointer('pointermove', controller.xAtTime(1) + 5));
		flushSync();
		expect(voiceover.clips[0]?.start).toBe(1);

		// and back two seconds to the right
		window.dispatchEvent(pointer('pointermove', controller.xAtTime(3) + 5));
		flushSync();
		expect(voiceover.clips[0]?.start).toBe(3);

		window.dispatchEvent(pointer('pointerup', controller.xAtTime(3) + 5));
		flushSync();
		unmount(app);
	});
});
