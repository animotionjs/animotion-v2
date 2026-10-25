import { describe, expect, it } from 'vitest';
import { EditorController } from './controller.svelte.js';
import type { Sequence } from '../scene/runtime/sequence.js';

const noScenes: Sequence = [];

describe('EditorController recording lock', () => {
	it('starts unlocked with narration audible', () => {
		const controller = new EditorController(noScenes, 30);
		expect(controller.locked).toBe(false);
		expect(controller.voiceover).toBe(true);
	});

	it('ignores every attempt to move the clock while locked', () => {
		const controller = new EditorController(noScenes, 30);
		controller.lock(true);
		controller.seek(1);
		controller.nudge(10);
		controller.play();
		controller.toggle();
		expect(controller.time).toBe(0);
		expect(controller.playing).toBe(false);
	});

	it('gives the clock back when recording ends', () => {
		const controller = new EditorController(noScenes, 30);
		controller.lock(true);
		controller.lock(false);
		expect(controller.locked).toBe(false);
	});
});
