import {
	all,
	defineScene,
	easeInOut,
	easeOut,
	getMeasureContext,
	position,
	range,
	wait
} from '#lib/canvas/index.js';

const first = [
	'function hello(name: string) {',
	'  const greeting = `Hello ${name}`;',
	'  console.log(greeting);',
	'  return greeting;',
	'}'
].join('\n');

const second = [
	'function greet(name: string) {',
	'  const greeting = `Hi ${name}`;',
	'  const upper = greeting.toUpperCase();',
	'  console.log(upper);',
	'  return upper;',
	'}'
].join('\n');

export default defineScene(
	'code',
	function* (s) {
		s.h2('Code', { y: -340 });

		const code = s.code({
			id: 'code',
			layoutKey: 'code',
			y: 60,
			code: first,
			language: 'typescript',
			fontSize: 26,
			lineHeight: 1.55,
			opacity: 0,
			scale: 0.96
		});

		const size = code.measure(getMeasureContext());
		code.detach();

		const panel = s.rect({
			y: 60,
			width: size.width + 104,
			height: size.height + 80,
			radius: 24,
			fill: {
				type: 'linear',
				from: { x: 0, y: 0 },
				to: { x: 1, y: 1 },
				stops: [
					{ offset: 0, color: '#1c1c22' },
					{ offset: 1, color: '#101014' }
				]
			},
			stroke: '#2a2a32',
			strokeWidth: 2,
			shadow: { color: 'rgba(0, 0, 0, 0.55)', blur: 44, offsetY: 20 },
			opacity: 0,
			scale: 0.96
		});

		s.add(code);

		yield* all(
			code.opacity.to(1, 0.5),
			code.scale.to(1, 0.5, easeOut),
			panel.opacity.to(1, 0.5),
			panel.scale.to(1, 0.5, easeOut)
		);
		yield* wait(0.3);
		yield* s.frame(panel, { zoom: 1.16, duration: 1, ease: easeInOut });

		// the diff keeps matching tokens in place while renamed and new tokens fade
		yield* code.morphTo(second, 0.9, easeInOut);
		yield* wait(0.3);

		yield* code.prepend('// greet the visitor\n', 0.55, easeInOut);
		yield* code.select(range(position(0, 0), position(0, 24)), 0.4, easeInOut);
		yield* wait(0.5);

		yield* s.frame({ x: 0, y: 0 }, { zoom: 1, duration: 0.8, ease: easeInOut });
		yield* wait(0.2);
	},
	{
		chapter: 'Code',
		notes:
			'Code is highlighted with twinkleplop and drawn on the canvas. The morph keeps unchanged tokens in place while new tokens fade in and removed tokens fade out. Insert and selection steps animate individual edits.',
		transition: { type: 'slide', duration: 0.8 }
	}
);
