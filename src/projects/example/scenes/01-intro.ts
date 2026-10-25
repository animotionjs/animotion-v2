import { defineScene, easeInOut } from '#lib/canvas/index.js';

export default defineScene(
	'intro',
	function* (s) {
		const title = s.text('Animotion', {
			layoutKey: 'title',
			fontSize: 86,
			fontWeight: 700,
			fill: '#ffffff',
			opacity: 0
		});

		yield* title.opacity.to(1, 0.6, easeInOut);

		yield* s.layout(
			() => {
				title.x(70);
				s.text('🪄', {
					layoutKey: 'logo',
					x: -260,
					fontSize: 86,
					fill: '#ffffff'
				});
			},
			{ duration: 0.6, enter: 'scale', ease: easeInOut }
		);
	},
	{
		chapter: 'Introduction',
		notes:
			'Welcome to Animotion, a Svelte engine for building animated presentations. Press the right arrow to move through the steps.'
	}
);
