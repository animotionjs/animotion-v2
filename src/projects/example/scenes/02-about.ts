import { defineScene } from '#lib/canvas/index.js';

export default defineScene(
	'about',
	// a static scene still uses the generator shape, so there is nothing to yield
	// eslint-disable-next-line require-yield
	function* (s) {
		s.text('About', {
			y: -86,
			fontSize: 48,
			fontWeight: 700,
			fill: '#ffffff'
		});

		s.body(
			'This talk is built with Svelte 5 runes, SvelteKit, and Tailwind CSS 4. The animations are driven by a canvas scene builder, not CSS keyframes, so every frame can be seeked, scrubbed, and rendered as video.',
			{
				y: 44,
				maxWidth: 920,
				lineHeight: 1.5,
				fontSize: 25,
				fill: '#9ca3af'
			}
		);
	},
	{
		chapter: 'About',
		notes:
			'This talk is built with Svelte 5 runes, SvelteKit, and Tailwind CSS 4. The animations are driven by the scene builder, not CSS keyframes. Long text wraps to its measured width.',
		transition: { type: 'fade', duration: 0.5 }
	}
);
