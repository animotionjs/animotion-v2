import { describe, expect, it } from 'vitest';
import { parseMarkdown, parseSceneMarkdown } from './markdown.js';

describe('markdown scenes', () => {
	it('reads scene transitions from frontmatter', () => {
		const document = parseSceneMarkdown(
			'---\nenter: fade\nexit: slide\nduration: 600\n---\n# Title\n\nBody'
		);

		expect(document.transition).toEqual({ enter: 'fade', exit: 'slide', duration: 600 });
		expect(document.body).toBe('# Title\n\nBody');
	});

	it('leaves a document without frontmatter untouched', () => {
		const source = '# Title\n\nBody';
		expect(parseSceneMarkdown(source)).toEqual({ body: source });
	});

	it('rejects an unknown transition name', () => {
		expect(() => parseSceneMarkdown('---\nenter: spin\n---\n# Title')).toThrow(
			'Unknown scene transition "spin"'
		);
	});

	it('splits steps outside fenced code', () => {
		const steps = parseMarkdown('# Title\n\n+++\n\n```ts\nconst a = 1;\n```');

		expect(steps).toHaveLength(2);
		expect(steps[1]?.blocks[0]).toMatchObject({ type: 'code', code: 'const a = 1;' });
	});

	it('marks replace steps', () => {
		const steps = parseMarkdown('First\n===\nSecond');

		expect(steps.map((step) => step.replace)).toEqual([false, true]);
		expect(steps[1]?.blocks[0]).toMatchObject({ type: 'paragraph', text: 'Second' });
	});

	it('reads layout keys from comments', () => {
		const [step] = parseMarkdown('<!-- layout: title -->\n# Title\n\n<!-- layout: body -->\nBody');

		expect(step?.blocks).toEqual([
			{ type: 'heading', level: 1, text: 'Title', layout: 'title' },
			{ type: 'paragraph', text: 'Body', layout: 'body' }
		]);
	});

	it('reads multi-state code fences', () => {
		const steps = parseMarkdown(
			'```ts steps\nlet count = 0;\n+++ 1\nlet count = $state(0);\n+++ 2-3\nlet a = 1;\nlet b = 2;\n```'
		);

		expect(steps).toHaveLength(1);
		expect(steps[0]?.blocks[0]).toMatchObject({
			type: 'code',
			language: 'ts',
			code: 'let count = 0;',
			steps: [
				{ code: 'let count = $state(0);', highlight: '1' },
				{ code: 'let a = 1;\nlet b = 2;', highlight: '2-3' }
			]
		});
	});

	it('keeps +++ inside a plain code fence', () => {
		const steps = parseMarkdown('```ts\nconst a = 1;\n+++\nconst b = 2;\n```');

		expect(steps).toHaveLength(1);
		expect(steps[0]?.blocks[0]).toMatchObject({
			type: 'code',
			code: 'const a = 1;\n+++\nconst b = 2;'
		});
	});
});
