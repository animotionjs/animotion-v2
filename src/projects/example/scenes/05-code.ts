import {
	all,
	defineScene,
	easeInOut,
	easeOut,
	getMeasureContext,
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
	'  console.log(greeting.toUpperCase());',
	'  return greeting;',
	'}'
].join('\n');

export default defineScene(
	'code',
	function* (s) {
		s.h2('Code', { y: -320 });

		const code = s.code({
			id: 'code',
			layoutKey: 'code',
			y: 70,
			code: first,
			fontSize: 26,
			lineHeight: 1.55,
			opacity: 0,
			scale: 0.96
		});

		const size = code.measure(getMeasureContext());
		code.detach();

		const panel = s.rect({
			y: 70,
			width: size.width + 96,
			height: size.height + 72,
			radius: 24,
			fill: '#18181b',
			stroke: '#27272a',
			strokeWidth: 2,
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
		yield* wait(0.4);
		yield* s.frame(panel, { zoom: 1.18, duration: 1.1, ease: easeInOut });
		yield* code.morphTo(second, 0.8, easeInOut);
		yield* wait(0.6);
		yield* s.frame({ x: 0, y: 0 }, { zoom: 1, duration: 0.8, ease: easeInOut });
		yield* wait(0.3);
	},
	{
		chapter: 'Code',
		notes:
			'Code blocks are canvas nodes. Switching source crossfades between highlighted token sets while the camera frames the block.'
	}
);
