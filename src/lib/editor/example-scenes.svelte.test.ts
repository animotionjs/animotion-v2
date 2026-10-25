import { mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import EditorMeasureStage from './EditorMeasureStage.svelte';
import Intro from '../../projects/example/scenes/01-intro.svelte';
import type { SceneEntry } from '../scene/runtime/sequence.js';
import type { SceneTimeline } from '../scene/runtime/runtime.svelte.js';

const entry: SceneEntry = {
	id: 'intro',
	order: 1,
	component: () => Promise.resolve({ default: Intro })
};

describe('example project scenes', () => {
	it('measures the intro without throwing', async () => {
		const onmeasured = vi.fn<(id: string, timeline: SceneTimeline, chapter: string) => void>();
		const app = mount(EditorMeasureStage, {
			target: document.body,
			props: { entry, onmeasured }
		});

		await vi.waitFor(() => expect(onmeasured).toHaveBeenCalledOnce(), { timeout: 5000 });
		const [, timeline, chapter] = onmeasured.mock.calls[0]!;
		expect(timeline.totalDuration).toBeGreaterThan(0);
		expect(chapter.length).toBeGreaterThan(0);

		unmount(app);
	});
});
