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

		s.rich(
			[
				{ text: 'This talk is built with ', fill: '#9ca3af' },
				{ text: 'Svelte 5 runes', fontWeight: 700, fill: '#f4f4f5' },
				{ text: ', ', fill: '#9ca3af' },
				{ text: 'SvelteKit', fontWeight: 700, fill: '#f4f4f5' },
				{ text: ', and ', fill: '#9ca3af' },
				{ text: 'Tailwind CSS 4', fontWeight: 700, fill: '#f4f4f5' },
				{ text: '. The animations are driven by a ', fill: '#9ca3af' },
				{ text: 'canvas scene builder', fontWeight: 700, fill: '#fbbf24' },
				{
					text: ', not CSS keyframes, so every frame can be seeked, scrubbed, and rendered as video.',
					fill: '#9ca3af'
				}
			],
			{
				y: 44,
				maxWidth: 920,
				lineHeight: 1.5,
				fontSize: 25,
				align: 'left'
			}
		);
	},
	{
		chapter: 'About',
		notes:
			'This talk is built with Svelte 5 runes, SvelteKit, and Tailwind CSS 4. The animations are driven by the scene builder, not CSS keyframes. The paragraph mixes bold and colored text runs while wrapping to its measured width.',
		transition: { type: 'fade', duration: 0.5 }
	}
);
