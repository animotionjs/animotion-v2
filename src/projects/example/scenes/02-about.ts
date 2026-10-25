import { defineScene } from '#lib/canvas/index.js';

export default defineScene(
	'about',
	// a static scene still uses the generator shape, so there is nothing to yield
	// eslint-disable-next-line require-yield
	function* (s) {
		s.text('About', {
			y: -29,
			fontSize: 48,
			fontWeight: 700,
			fill: '#ffffff'
		});

		s.text('Svelte 5 + SvelteKit + Tailwind CSS 4', {
			y: 37,
			fontSize: 25,
			fontWeight: 400,
			fill: '#9ca3af'
		});
	},
	{
		chapter: 'About',
		notes:
			'This talk is built with Svelte 5 runes, SvelteKit, and Tailwind CSS 4. The animations are driven by the scene builder, not CSS keyframes.'
	}
);
