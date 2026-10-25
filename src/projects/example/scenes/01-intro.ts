import { defineScene, easeInOut, getMeasureContext } from '#lib/canvas/index.js';

export default defineScene(
	'intro',
	function* (s) {
		const title = s.text('Animotion', {
			layoutKey: 'title',
			fontSize: 86.4,
			fontWeight: 700,
			fill: '#ffffff',
			opacity: 0
		});

		yield* title.opacity.to(1, 0.6, easeInOut);

		yield* s.layout(
			() => {
				const ctx = getMeasureContext();
				const titleWidth = title.measure(ctx).width;
				const logo = s.text('🪄', {
					layoutKey: 'logo',
					fontSize: 86.4,
					fontWeight: 700,
					fill: '#ffffff'
				});

				ctx.font = title.font;
				const gap = ctx.measureText(' ').width;
				const logoWidth = logo.measure(ctx).width;

				logo.x(-(titleWidth + gap) / 2);
				title.x((logoWidth + gap) / 2);
			},
			{ duration: 0.6, enter: 'scale', ease: easeInOut }
		);
	},
	{
		chapter: 'Introduction',
		notes:
			'Welcome to Animotion, a canvas engine for building animated presentations. Press the right arrow to move through the steps.'
	}
);
