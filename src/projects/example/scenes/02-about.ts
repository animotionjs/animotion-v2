import { defineScene, wait } from '#lib/canvas/index.js';

export default defineScene(
	'about',
	function* (s) {
		s.text('About', {
			y: -20,
			fontSize: 48,
			fontWeight: 700,
			fill: '#ffffff'
		});

		s.text('Svelte 5 + SvelteKit + Tailwind CSS 4', {
			y: 40,
			fontSize: 25,
			fontWeight: 400,
			fill: '#9ca3af'
		});

		yield* wait(1.2);
	},
	{
		chapter: 'About',
		notes:
			'This talk is built with Svelte 5 runes, SvelteKit, and Tailwind CSS 4. The animations are driven by the scene builder, not CSS keyframes.'
	}
);
