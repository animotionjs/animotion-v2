import { describe, expect, it } from 'vitest';
import { notifyScenesChanged } from '../config/scenes.js';
import { getComponent, componentsGeneration } from './components.svelte.js';
import { getChapter, getMeasured, setMeasured } from './measure.js';
import type { SceneTimeline } from '../scene/runtime/runtime.svelte.js';

function timeline(totalDuration: number): SceneTimeline {
	return { enterDuration: 0, introHold: 0, steps: [], totalDuration };
}

describe('scene cache invalidation', () => {
	it('drops every measurement when a scene file changes', () => {
		setMeasured('intro', 30, timeline(4), 'Opening');
		expect(getMeasured('intro', 30)?.totalDuration).toBe(4);
		expect(getChapter('intro', 30)).toBe('Opening');

		notifyScenesChanged();

		expect(getMeasured('intro', 30)).toBeUndefined();
		expect(getChapter('intro', 30)).toBe('');
	});

	it('bumps the component generation so the preview warms again', () => {
		const before = componentsGeneration();

		notifyScenesChanged();

		expect(componentsGeneration()).toBe(before + 1);
		expect(getComponent('intro')).toBeUndefined();
	});
});
