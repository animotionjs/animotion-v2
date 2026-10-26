import { describe, expect, it } from 'vitest';
import {
	CircleNode,
	CodeNode,
	PathNode,
	RectNode,
	RichTextNode,
	SvgNode,
	VideoNode,
	all,
	defineScene,
	getMeasureContext,
	position,
	range,
	resolvePaint,
	spring,
	wait
} from '../../lib/canvas/index.js';

function canvasContext(width = 300, height = 300) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('expected a 2d context');
	ctx.translate(width / 2, height / 2);
	return ctx;
}

function pixel(ctx: CanvasRenderingContext2D, x: number, y: number) {
	const data = ctx.getImageData(x, y, 1, 1).data;
	return { r: data[0]!, g: data[1]!, b: data[2]!, a: data[3]! };
}

describe('canvas shapes', () => {
	it('draws circles, paths, and splines from local coordinates', () => {
		const circle = new CircleNode({ radius: 40, fill: '#ff0000' });
		expect(circle.measure()).toEqual({ width: 80, height: 80 });
		expect(circle.localBox()).toEqual({ x: -40, y: -40, width: 80, height: 80 });

		const path = new PathNode({
			path: 'M -20 -20 L 20 -20 L 20 20 Z',
			bounds: { x: -20, y: -20, width: 40, height: 40 }
		});
		expect(path.measure()).toEqual({ width: 40, height: 40 });

		// static drawing test, so there is nothing to yield
		// eslint-disable-next-line require-yield
		const definition = defineScene('shapes', function* (s) {
			s.circle({ radius: 60, fill: '#ff0000' });
		});
		const scene = definition.create();
		scene.seek(0);
		const ctx = canvasContext(200, 200);
		scene.draw(ctx);
		expect(pixel(ctx, 100, 100)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
		expect(pixel(ctx, 20, 20).a).toBe(0);
	});

	it('clips children to a rounded rect', () => {
		// static drawing test, so there is nothing to yield
		// eslint-disable-next-line require-yield
		const definition = defineScene('clip', function* (s) {
			const card = s.rect({ width: 100, height: 100, radius: 24, clip: true, fill: '#000000' });
			card.add(s.circle({ radius: 100, fill: '#00ff00' }));
		});
		const scene = definition.create();
		scene.seek(0);
		const ctx = canvasContext();
		scene.draw(ctx);
		expect(pixel(ctx, 150, 150)).toEqual({ r: 0, g: 255, b: 0, a: 255 });
		expect(pixel(ctx, 105, 105).a).toBe(0);
		expect(pixel(ctx, 105, 150).g).toBeGreaterThan(0);
	});

	it('clips a group to an explicit rounded box', () => {
		// static drawing test, so there is nothing to yield
		// eslint-disable-next-line require-yield
		const definition = defineScene('group-clip', function* (s) {
			s.group(
				{ clip: { width: 80, height: 80, radius: 20 } },
				s.circle({ radius: 100, fill: '#00ff00' })
			);
		});
		const scene = definition.create();
		scene.seek(0);
		const ctx = canvasContext();
		scene.draw(ctx);
		expect(pixel(ctx, 150, 150)).toEqual({ r: 0, g: 255, b: 0, a: 255 });
		expect(pixel(ctx, 100, 150).a).toBe(0);
		expect(pixel(ctx, 150, 100).a).toBe(0);
	});

	it('caches a moving subtree and rebuilds it when paint changes', () => {
		// static drawing test, so there is nothing to yield
		// eslint-disable-next-line require-yield
		const definition = defineScene('cache', function* (s) {
			s.rect({
				id: 'box',
				width: 100,
				height: 100,
				fill: '#ff0000',
				cache: true,
				cachePadding: 8
			});
		});
		const scene = definition.create();
		const box = scene.root.children[0];
		if (!(box instanceof RectNode)) throw new Error('expected a rect');
		const ctx = canvasContext();

		scene.seek(0);
		ctx.clearRect(-150, -150, 300, 300);
		scene.draw(ctx);
		expect(pixel(ctx, 150, 150)).toEqual({ r: 255, g: 0, b: 0, a: 255 });

		box.x(80);
		ctx.clearRect(-150, -150, 300, 300);
		scene.draw(ctx);
		expect(pixel(ctx, 230, 150)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
		expect(pixel(ctx, 150, 150).a).toBe(0);

		box.fill('#00ff00');
		ctx.clearRect(-150, -150, 300, 300);
		scene.draw(ctx);
		expect(pixel(ctx, 230, 150)).toEqual({ r: 0, g: 255, b: 0, a: 255 });
	});
});

describe('canvas paints', () => {
	it('resolves conic gradients and image patterns', () => {
		const ctx = getMeasureContext();
		const conic = resolvePaint(
			ctx,
			{
				type: 'conic',
				stops: [
					{ offset: 0, color: '#ff0000' },
					{ offset: 1, color: '#0000ff' }
				]
			},
			100,
			100
		);
		expect(conic).not.toBeTypeOf('string');

		const source = document.createElement('canvas');
		source.width = 2;
		source.height = 2;
		const pattern = resolvePaint(
			ctx,
			{ type: 'pattern', image: source, repetition: 'repeat', scale: 2 },
			100,
			100
		);
		expect(pattern).toBeInstanceOf(CanvasPattern);
	});
});

describe('canvas rich text', () => {
	it('wraps styled runs and keeps explicit newlines', () => {
		const node = new RichTextNode({
			runs: [
				{ text: 'Hello ', fontWeight: 400 },
				{ text: 'styled', fontWeight: 700, fill: '#fbbf24' },
				{ text: ' world\nsecond line', fontWeight: 400 }
			],
			fontSize: 20,
			maxWidth: 120,
			lineHeight: 1.4
		});
		const ctx = getMeasureContext();
		const lines = node.lines(ctx);
		expect(lines.length).toBeGreaterThan(2);
		expect(
			lines.some((line) => line.fragments.some((fragment) => fragment.fill === '#fbbf24'))
		).toBe(true);
		expect(
			lines.some((line) => line.fragments.some((fragment) => fragment.text.includes('second')))
		).toBe(true);
		const size = node.measure(ctx);
		expect(size.width).toBeLessThanOrEqual(120);
		expect(size.height).toBeCloseTo(lines.length * 20 * 1.4);
	});
});

describe('canvas svg', () => {
	it('accepts inline markup and explicit bounds', () => {
		const node = new SvgNode({
			markup: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="red"/></svg>',
			width: 80,
			height: 60
		});
		expect(node.kind).toBe('svg');
		expect(node.measure()).toEqual({ width: 80, height: 60 });
	});
});

describe('canvas media options', () => {
	it('keeps smoothing and smooth corner settings on the node', () => {
		const video = new VideoNode({
			src: '/media/aurora-motion.mp4',
			width: 320,
			height: 180,
			smoothness: 0.4,
			smoothing: false
		});
		expect(video.smoothing()).toBe(false);
		expect(video.smoothness()).toBe(0.4);
		expect(video.cacheable).toBe(false);
		video.smoothing(true);
		expect(video.smoothing()).toBe(true);
	});
});

describe('canvas code polish', () => {
	it('shows a caret after scrolling and rewinds it', () => {
		const source = Array.from({ length: 10 }, (_, index) => `const v${index} = ${index};`).join(
			'\n'
		);
		const definition = defineScene('cursor', function* (s) {
			const code = s.code({
				code: source,
				language: 'typescript',
				fontSize: 20,
				maxLines: 4,
				scrollFadeSize: 20
			});
			yield* wait(0.1);
			yield* code.reveal(range(position(8, 0), position(8, 4)), 0.3);
			yield* code.placeCursor(position(8, 4), 0.2);
		});

		const scene = definition.create();
		const code = scene.root.children[0];
		if (!(code instanceof CodeNode)) throw new Error('expected code');
		scene.seek(0.65);
		expect(code.cursor()).toEqual({ line: 8, col: 4 });
		expect(code.cursorAlpha()).toBe(1);
		expect(code.scroll()).toBeGreaterThan(0);
		expect(code.measure(getMeasureContext()).height).toBeCloseTo(4 * 20 * 1.5 + 40);
		const ctx = canvasContext();
		scene.draw(ctx);
		scene.seek(0);
		expect(code.cursor()).toBeNull();
		expect(code.cursorAlpha()).toBe(0);
	});
});

describe('canvas spring', () => {
	it('starts at zero, ends at one, and can overshoot', () => {
		const ease = spring({ stiffness: 120, damping: 8 });
		expect(ease(0)).toBe(0);
		expect(ease(1)).toBe(1);
		let overshot = false;
		for (let index = 1; index < 100; index++) {
			if (ease(index / 100) > 1.01) overshot = true;
		}
		expect(overshot).toBe(true);
	});

	it('drives a signal as a normal timeline step', () => {
		const definition = defineScene('spring', function* (s) {
			const box = s.rect({ width: 20, height: 20, opacity: 0 });
			yield* all(box.opacity.to(1, 0.5, spring({ damping: 10 })), wait(0.5));
		});
		const scene = definition.create();
		scene.seek(0.25);
		const box = scene.root.children[0];
		expect(box?.opacity()).toBeGreaterThan(0);
		expect(box?.opacity()).toBeLessThan(1);
		scene.seek(0.5);
		expect(box?.opacity()).toBe(1);
	});
});
