import { describe, expect, it } from 'vitest';
import {
	RectNode,
	cancel,
	defineScene,
	linear,
	loop,
	sequence,
	spawn,
	wait,
	waitFor
} from '../../lib/canvas/index.js';

function boxAt(scene: { root: { children: readonly unknown[] } }, index = 0): RectNode {
	const node = scene.root.children[index];
	if (!(node instanceof RectNode)) throw new Error('expected a rect');
	return node;
}

describe('canvas threads', () => {
	it('runs a spawned animation alongside the main timeline', () => {
		const definition = defineScene('thread', function* (s) {
			const box = s.rect({ width: 20, height: 20 });
			const thread = spawn(box.x.to(100, 1, linear));
			yield* wait(0.5);
			yield* waitFor(thread);
		});

		const scene = definition.create();
		const box = boxAt(scene);
		expect(scene.duration).toBeCloseTo(1);
		expect(scene.threads).toHaveLength(1);

		scene.seek(0.25);
		expect(box.x()).toBeCloseTo(25);
		scene.seek(0.6);
		expect(box.x()).toBeCloseTo(60);
		scene.seek(1);
		expect(box.x()).toBe(100);
		scene.seek(0.25);
		expect(box.x()).toBeCloseTo(25);
	});

	it('freezes a cancelled thread at its cancellation time', () => {
		const definition = defineScene('cancel', function* (s) {
			const box = s.rect({ width: 20, height: 20 });
			const thread = spawn(box.x.to(100, 1, linear));
			yield* wait(0.5);
			cancel(thread);
			yield* wait(0.5);
		});

		const scene = definition.create();
		const box = boxAt(scene);
		scene.seek(0.25);
		expect(box.x()).toBeCloseTo(25);
		scene.seek(0.75);
		expect(box.x()).toBeCloseTo(50);
		scene.seek(0.25);
		expect(box.x()).toBeCloseTo(25);
	});

	it('repeats a factory with the state left by the previous pass', () => {
		const definition = defineScene('loop', function* (s) {
			const box = s.rect({ width: 20, height: 20 });
			yield* loop(() => box.x.to(box.x() + 100, 0.5, linear), 2);
		});

		const scene = definition.create();
		const box = boxAt(scene);
		expect(scene.duration).toBeCloseTo(1);
		scene.seek(0.25);
		expect(box.x()).toBeCloseTo(50);
		scene.seek(0.75);
		expect(box.x()).toBeCloseTo(150);
		scene.seek(0);
		expect(box.x()).toBe(0);
		scene.seek(0.75);
		expect(box.x()).toBeCloseTo(150);
	});

	it('sequences animations as one step', () => {
		const definition = defineScene('sequence', function* (s) {
			const box = s.rect({ width: 20, height: 20 });
			yield* sequence(box.x.to(100, 0.5, linear), box.opacity.to(0, 0.5, linear));
		});

		const scene = definition.create();
		const box = boxAt(scene);
		expect(scene.timeline.steps).toHaveLength(1);
		scene.seek(0.25);
		expect(box.x()).toBeCloseTo(50);
		expect(box.opacity()).toBe(1);
		scene.seek(0.75);
		expect(box.x()).toBe(100);
		expect(box.opacity()).toBeCloseTo(0.5);
	});
});
