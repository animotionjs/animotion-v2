import { easeInOut, easeOut } from './easing.js';
import { defineScene } from './scene.js';
import { all, wait } from './steps.js';

export default defineScene(
	'intro',
	function* (s) {
		const title = s.h1('Animotion', { layoutKey: 'title', opacity: 0, y: 20 });

		const card = s.card(
			{
				id: 'card',
				layoutKey: 'card',
				x: -260,
				y: 180,
				width: 420,
				height: 200,
				radius: 28,
				opacity: 0,
				scale: 0.94
			},
			s.h3('Canvas engine')
		);

		yield* all(title.opacity.to(1, 0.6), title.y.to(0, 0.6, easeOut));
		yield* wait(0.5);
		yield* all(card.opacity.to(1, 0.5), card.scale.to(1, 0.5, easeOut));
		yield* card.x.to(260, 0.8, easeInOut);
	},
	{
		chapter: 'Introduction',
		notes: 'The first canvas scene.'
	}
);
