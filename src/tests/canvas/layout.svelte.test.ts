import { describe, expect, it } from 'vitest';
import {
	CodeNode,
	RectNode,
	defineScene,
	easeInOut,
	easeOut,
	linear,
	wait
} from '../../lib/canvas/index.js';

function rectAt(scene: { root: { children: readonly unknown[] } }, index = 0): RectNode {
	const node = scene.root.children[index];
	if (!(node instanceof RectNode)) throw new Error('expected a rect');
	return node;
}

describe('canvas layout', () => {
	it('glides keyed nodes and restores them on rewind', () => {
		const definition = defineScene('layout', function* (s) {
			const a = s.rect({ layoutKey: 'a', width: 100, height: 100, x: -200, y: 0 });
			const b = s.rect({ layoutKey: 'b', width: 100, height: 100, x: 200, y: 0 });

			yield* s.layout(
				() => {
					a.x(0);
					a.width(300);
					b.x(0);
				},
				{ duration: 0.8, enter: 'scale', exit: 'fade', ease: easeInOut }
			);
		});

		const scene = definition.create();
		const a = rectAt(scene, 0);
		const b = rectAt(scene, 1);

		scene.seek(0);
		expect(a.x() + a.layoutX()).toBe(-200);
		expect(a.layoutX()).toBe(-200);

		scene.seek(0.4);
		expect(a.x() + a.layoutX()).toBeCloseTo(-100);
		expect(a.layoutScaleX()).toBeLessThan(1);
		expect(b.x() + b.layoutX()).toBeCloseTo(100);

		scene.seek(0.8);
		expect(a.x()).toBe(0);
		expect(a.width()).toBe(300);
		expect(a.layoutX()).toBe(0);
		expect(a.layoutScaleX()).toBe(1);

		scene.seek(0);
		expect(a.x() + a.layoutX()).toBe(-200);
		expect(b.x() + b.layoutX()).toBe(200);
	});

	it('pops an entering node in from zero scale', () => {
		const logos: RectNode[] = [];
		const definition = defineScene('pop', function* (s) {
			yield* wait(0.1);
			yield* s.layout(
				() => {
					logos.push(s.rect({ layoutKey: 'logo', width: 100, height: 100 }));
				},
				{ duration: 1, enter: 'scale', ease: linear }
			);
		});

		const scene = definition.create();
		scene.seek(0.1);
		const logo = logos.at(-1);
		if (!logo) throw new Error('expected the entering rect');

		expect(logo.layoutScaleX()).toBe(0);
		expect(logo.layoutScaleY()).toBe(0);

		scene.seek(0.6);
		expect(logo.layoutScaleX()).toBeCloseTo(0.5);
		expect(logo.layoutScaleY()).toBeCloseTo(0.5);

		scene.seek(1.1);
		expect(logo.layoutScaleX()).toBe(1);
	});

	it('keeps nodes added after a layout step when the scene rewinds', () => {
		const definition = defineScene('later-node', function* (s) {
			const box = s.rect({ layoutKey: 'box', width: 100, height: 100 });
			yield* s.layout(
				() => {
					box.x(100);
				},
				{ duration: 0.5 }
			);
			s.text('added later', { y: 100 });
		});

		const scene = definition.create();
		expect(scene.root.children.some((node) => node.kind === 'text')).toBe(true);

		scene.seek(0);
		expect(scene.root.children.some((node) => node.kind === 'text')).toBe(true);

		scene.seek(scene.duration);
		expect(scene.root.children.some((node) => node.kind === 'text')).toBe(true);
	});

	it('adds and removes keyed nodes with the layout step', () => {
		const definition = defineScene('enter-exit', function* (s) {
			const first = s.rect({ layoutKey: 'first', width: 100, height: 100 });
			yield* wait(0.2);
			yield* s.layout(
				() => {
					first.detach();
					s.rect({ layoutKey: 'second', width: 200, height: 100 });
				},
				{ duration: 0.5, enter: 'scale', exit: 'fade' }
			);
		});

		const scene = definition.create();

		expect(scene.root.children).toHaveLength(1);

		scene.seek(0.45);
		expect(scene.root.children).toHaveLength(1);

		scene.seek(0.7);
		expect(scene.root.children).toHaveLength(1);
		expect(scene.root.children[0]?.layoutKey).toBe('second');

		scene.seek(0);
		expect(scene.root.children).toHaveLength(1);
		expect(scene.root.children[0]?.layoutKey).toBe('first');
	});
});

describe('canvas camera', () => {
	it('frames a node by its measured bounds', () => {
		const definition = defineScene('camera', function* (s) {
			const box = s.rect({ width: 100, height: 100, x: 0, y: 200 });
			yield* s.frame(box, { zoom: 2, duration: 1, ease: easeOut });
		});

		const scene = definition.create();

		scene.seek(0);
		expect(scene.camera.x()).toBe(0);
		expect(scene.camera.y()).toBe(0);

		scene.seek(0.5);
		expect(scene.camera.y()).toBeGreaterThan(0);
		expect(scene.camera.y()).toBeLessThan(200);
		expect(scene.camera.zoom()).toBeGreaterThan(1);

		scene.seek(1);
		expect(scene.camera.y()).toBe(200);
		expect(scene.camera.zoom()).toBe(2);

		scene.seek(0);
		expect(scene.camera.y()).toBe(0);
		expect(scene.camera.zoom()).toBe(1);
	});
});

describe('canvas code', () => {
	it('crossfades between code states', () => {
		const definition = defineScene('code', function* (s) {
			const code = s.code({ code: 'const a = 1;' });
			yield* wait(0.2);
			yield* code.morphTo('const b = 2;', 0.6, easeInOut);
		});

		const scene = definition.create();
		const code = scene.root.children[0];
		if (!(code instanceof CodeNode)) throw new Error('expected code');

		scene.seek(0);
		expect(code.code()).toBe('const a = 1;');

		scene.seek(0.19);
		expect(code.code()).toBe('const a = 1;');

		scene.seek(0.2);
		expect(code.previousCode).toBe('const a = 1;');
		expect(code.transition()).toBe(0);

		scene.seek(0.5);
		expect(code.previousCode).toBe('const a = 1;');
		expect(code.transition()).toBeGreaterThan(0);

		scene.seek(0.8);
		expect(code.code()).toBe('const b = 2;');
		expect(code.previousCode).toBeNull();

		scene.seek(0);
		expect(code.code()).toBe('const a = 1;');
	});
});
