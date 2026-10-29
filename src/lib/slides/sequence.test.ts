import type { Component } from 'svelte';
import { describe, expect, it } from 'vitest';
import { createSequence } from './sequence.js';

const component = {} as Component;

describe('scene sequence', () => {
	it('reads transitions exported by a Svelte scene', () => {
		const sequence = createSequence(
			{
				'/presentations/demo/scenes/01-intro.svelte': {
					default: component,
					transition: { enter: 'zoom', exit: 'fade' }
				}
			},
			{}
		);

		expect(sequence[0]?.transition).toEqual({ enter: 'zoom', exit: 'fade' });
	});

	it('strips markdown frontmatter and keeps its transition', () => {
		const sequence = createSequence(
			{},
			{
				'/presentations/demo/scenes/02-notes.md': '---\nenter: fade\n---\n# Notes'
			}
		);

		expect(sequence[0]).toMatchObject({
			kind: 'markdown',
			id: 'notes',
			source: '# Notes',
			transition: { enter: 'fade' }
		});
	});

	it('orders scenes by their number prefix', () => {
		const sequence = createSequence(
			{
				'/presentations/demo/scenes/10-last.svelte': { default: component },
				'/presentations/demo/scenes/02-second.svelte': { default: component }
			},
			{}
		);

		expect(sequence.map((scene) => scene.id)).toEqual(['second', 'last']);
	});
});
