import { describe, expect, it } from 'vitest';
import {
	CodeNode,
	ImageNode,
	TextNode,
	defineScene,
	easeInOut,
	getMeasureContext,
	position,
	range,
	resolvePaint,
	wait
} from '../../lib/canvas/index.js';
import { registerTestLanguages } from '../../lib/scene/code/test-languages.js';

registerTestLanguages();

function context() {
	return getMeasureContext();
}

describe('canvas rich text', () => {
	it('wraps a paragraph to a maximum width and grows its measured height', () => {
		const node = new TextNode({
			text: 'A long line of text that has to wrap across several lines in the canvas engine.',
			fontSize: 20,
			maxWidth: 200,
			lineHeight: 1.5
		});
		const ctx = context();
		const lines = node.lines(ctx);
		expect(lines.length).toBeGreaterThan(1);
		const size = node.measure(ctx);
		expect(size.width).toBeLessThanOrEqual(200);
		expect(size.height).toBeCloseTo(lines.length * 20 * 1.5);
	});

	it('keeps explicit line breaks and breaks single long words', () => {
		const node = new TextNode({
			text: 'first\nsecond\nsupercalifragilisticexpialidocious',
			fontSize: 20,
			maxWidth: 80
		});
		const lines = node.lines(context());
		expect(lines[0]).toBe('first');
		expect(lines[1]).toBe('second');
		expect(lines.length).toBeGreaterThan(3);
	});
});

describe('canvas paint', () => {
	it('resolves linear and radial gradients in the node box', () => {
		const ctx = context();
		const linear = resolvePaint(
			ctx,
			{
				type: 'linear',
				from: { x: 0, y: 0 },
				to: { x: 1, y: 1 },
				stops: [
					{ offset: 0, color: '#ff0000' },
					{ offset: 1, color: '#0000ff' }
				]
			},
			200,
			100
		);
		expect(linear).not.toBeTypeOf('string');
		const radial = resolvePaint(
			ctx,
			{
				type: 'radial',
				stops: [
					{ offset: 0, color: '#ffffff' },
					{ offset: 1, color: '#000000' }
				]
			},
			200,
			100
		);
		expect(radial).not.toBeTypeOf('string');
	});
});

describe('canvas media', () => {
	it('sizes an image from its explicit box', () => {
		const image = new ImageNode({
			src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
			width: 320,
			height: 180,
			radius: 20
		});
		expect(image.measure()).toEqual({ width: 320, height: 180 });
	});
});

describe('canvas code edits', () => {
	it('diffs tokens and animates insert, replace and selection', () => {
		const definition = defineScene('edits', function* (s) {
			const code = s.code({ code: 'const a = 1;', language: 'typescript', fontSize: 20 });
			yield* wait(0.1);
			yield* code.insertText('2', position(0, 11), 0.2);
			yield* code.replaceText('a', 'b', 0.2);
			yield* code.select(range(position(0, 0), position(0, 5)), 0.2);
			yield* code.removeText(range(position(0, 6), position(0, 8)), 0.2);
		});

		const scene = definition.create();
		const code = scene.root.children[0];
		if (!(code instanceof CodeNode)) throw new Error('expected code');

		scene.seek(0.25);
		expect(code.code()).toBe('const a = 12;');
		expect(code.morphTokens.some((token) => token.morph === 'create')).toBe(true);

		scene.seek(0.5);
		expect(code.code()).toBe('const b = 12;');

		scene.seek(0.7);
		expect(code.selection()?.start).toEqual({ line: 0, col: 0 });
		expect(code.selectionAlpha()).toBeCloseTo(1);

		scene.seek(0);
		expect(code.code()).toBe('const a = 1;');
		expect(code.selection()).toBeNull();
	});

	it('scrolls and reveals a range inside a clipped block', () => {
		const source = Array.from({ length: 12 }, (_, index) => `const v${index} = ${index};`).join(
			'\n'
		);
		const definition = defineScene('scroll', function* (s) {
			const code = s.code({ code: source, language: 'typescript', maxLines: 4, fontSize: 20 });
			yield* wait(0.1);
			yield* code.reveal(range(position(9, 0), position(10, 5)), 0.4, easeInOut);
		});

		const scene = definition.create();
		const code = scene.root.children[0];
		if (!(code instanceof CodeNode)) throw new Error('expected code');

		scene.seek(0.5);
		expect(code.scroll()).toBeCloseTo(7);
		expect(code.selection()?.start.line).toBe(9);
		expect(code.measure(context()).height).toBeCloseTo(4 * 20 * 1.5);
	});
});
