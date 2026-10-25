import { describe, expect, it } from 'vitest';
import { RectNode, all, defineScene, easeInOut, easeOut, wait } from '../../lib/canvas/index.js';

function firstRect(scene: { root: { children: readonly unknown[] } }): RectNode {
	const node = scene.root.children[0];
	if (!(node instanceof RectNode)) throw new Error('expected a rect');
	return node;
}

describe('canvas scene', () => {
	it('records generator steps and seeks deterministically', () => {
		const definition = defineScene('test', function* (s) {
			const box = s.rect({ width: 100, height: 100, x: 0, opacity: 0 });
			yield* box.opacity.to(1, 0.5, easeInOut);
			yield* wait(0.5);
			yield* box.x.to(100, 0.5, easeOut);
		});

		const scene = definition.create();
		const box = firstRect(scene);

		expect(scene.duration).toBeCloseTo(1.5);
		expect(scene.timeline.steps).toHaveLength(3);
		expect(definition.timeline().totalDuration).toBeCloseTo(1.5);

		scene.seek(0);
		expect(box.opacity()).toBe(0);
		expect(box.x()).toBe(0);

		scene.seek(0.25);
		expect(box.opacity()).toBeCloseTo(0.5);

		scene.seek(0.5);
		expect(box.opacity()).toBe(1);

		scene.seek(1.25);
		expect(box.x()).toBeCloseTo(87.5);

		scene.seek(1.5);
		expect(box.x()).toBe(100);

		scene.seek(0);
		expect(box.opacity()).toBe(0);
		expect(box.x()).toBe(0);
	});

	it('records parallel animations as one step', () => {
		const definition = defineScene('parallel', function* (s) {
			const box = s.rect({ width: 100, height: 100, x: 0, opacity: 0 });
			yield* all(box.x.to(100, 0.5), box.opacity.to(1, 0.5));
		});

		const scene = definition.create();
		const box = firstRect(scene);

		expect(scene.timeline.steps).toHaveLength(1);
		expect(scene.duration).toBeCloseTo(0.5);

		scene.seek(0.25);
		expect(box.x()).toBeCloseTo(50);
		expect(box.opacity()).toBeCloseTo(0.5);

		scene.seek(0);
		expect(box.x()).toBe(0);
		expect(box.opacity()).toBe(0);
	});

	it('records audio cues', () => {
		const definition = defineScene('audio', function* (s) {
			s.sound('/intro.mp3', { at: 0.5, volume: 0.4, loop: true });
			s.sound('/hit.wav', { at: 1.2 });
			yield* wait(1);
		});

		const scene = definition.create();
		expect(scene.audio).toEqual([
			{ src: '/intro.mp3', at: 0.5, volume: 0.4, loop: true, duration: null },
			{ src: '/hit.wav', at: 1.2, volume: 1, loop: false, duration: null }
		]);
	});
});
