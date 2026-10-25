import { mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import EditorMeasureStage from './EditorMeasureStage.svelte';
import SteppedScene from '../components/fixtures/SteppedScene.svelte';
import type { SceneEntry } from '../scene/runtime/sequence.js';
import type { SceneTimeline } from '../scene/runtime/runtime.svelte.js';

const entry: SceneEntry = {
	id: 'intro',
	order: 1,
	component: () => Promise.resolve({ default: SteppedScene })
};

describe('EditorMeasureStage', () => {
	it('reports the scene timeline once the scene has mounted', async () => {
		const onmeasured = vi.fn<(id: string, timeline: SceneTimeline, chapter: string) => void>();
		const app = mount(EditorMeasureStage, {
			target: document.body,
			props: { entry, onmeasured }
		});

		await vi.waitFor(() => expect(onmeasured).toHaveBeenCalledOnce());

		const [id, timeline, chapter] = onmeasured.mock.calls[0]!;
		expect(id).toBe('intro');
		expect(timeline.steps).toHaveLength(1);
		expect(timeline.steps[0]!.duration).toBeCloseTo(0.2);
		expect(timeline.totalDuration).toBeGreaterThanOrEqual(0.2);
		// the chapter label is read from the mounted scene's hidden block
		expect(chapter).toBe('Fixture chapter');

		unmount(app);
	});
});
