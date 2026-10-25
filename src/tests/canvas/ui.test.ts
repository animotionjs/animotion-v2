import { describe, expect, it } from 'vitest';
import { defineScene } from '../../lib/canvas/index.js';
import { CanvasSceneManager } from '../../lib/canvas/ui.js';

describe('canvas editor adapter', () => {
	it('maps the scene into the existing editor timeline shape', () => {
		const definition = defineScene('adapter', function* (s) {
			const box = s.rect({ width: 100, height: 100, opacity: 0 });
			yield* box.opacity.to(1, 0.5);
		});

		const manager = new CanvasSceneManager(definition.create());
		const frames: Array<{ time: number; opacity: number; x: number }> = [];
		manager.setRenderer((time, transition) =>
			frames.push({ time, opacity: transition.opacity, x: transition.x })
		);

		expect(manager.timeline.enterDuration).toBe(0.8);
		expect(manager.timeline.totalDuration).toBeCloseTo(1.3);
		expect(manager.loaded).toBe(true);

		manager.seekToTime(0.4);
		const enter = frames.at(-1);
		expect(enter?.time).toBe(0);
		expect(enter?.opacity).toBeCloseTo(0.5);

		manager.seekToTime(1);
		const body = frames.at(-1);
		expect(body?.time).toBeCloseTo(0.2);
		expect(body?.opacity).toBe(1);
		expect(body?.x).toBe(0);

		expect(manager.advanceFrame(0.3).done).toBe(true);
	});
});
