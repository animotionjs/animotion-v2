import { easeInOut, easeOut } from './easing.js';
import { defineScene } from './scene.js';
import { all, wait } from './steps.js';

const first = ['function hello(name: string) {', '  return `Hello ${name}`;', '}'].join('\n');

const second = [
	'const scene = createScene(function* (s) {',
	"  const title = s.h1('Animotion');",
	'  yield* title.to({ opacity: 1, y: 0 }, 0.6);',
	'});'
].join('\n');

export default defineScene(
	'layout',
	function* (s) {
		const title = s.text('Layout', {
			layoutKey: 'title',
			y: -300,
			fontSize: 72,
			fontWeight: 700,
			fill: '#fafafa'
		});

		const card = s.card(
			{
				id: 'card',
				layoutKey: 'card',
				x: -320,
				y: 80,
				width: 420,
				height: 220
			},
			s.h3('A small card')
		);

		const code = s.code({
			id: 'code',
			layoutKey: 'code',
			x: 340,
			y: 80,
			code: first,
			fontSize: 24,
			lineHeight: 1.5,
			opacity: 0,
			scale: 0.94
		});

		yield* wait(0.4);

		yield* s.layout(
			() => {
				title.y(-320);
				card.width(900);
				card.height(280);
				card.set({ x: 0, y: -60 });
				code.set({ x: 0, y: 230 });
			},
			{ duration: 0.8, enter: 'scale', exit: 'fade', ease: easeInOut }
		);

		yield* all(code.opacity.to(1, 0.5), code.scale.to(1, 0.5, easeOut));

		yield* s.frame(code, { zoom: 1.25, duration: 1.1, ease: easeInOut });

		yield* code.morphTo(second, 0.8, easeInOut);
		yield* wait(0.4);
	},
	{
		chapter: 'Layout',
		notes: 'A keyed layout morph, a camera flight, and a code crossfade.'
	}
);
