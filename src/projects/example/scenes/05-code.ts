import {
	all,
	defineScene,
	easeInOut,
	easeOut,
	getMeasureContext,
	position,
	wait
} from '#lib/canvas/index.js';

const first = [
	'function hello(name: string) {',
	'  const greeting = `Hello ${name}`;',
	'  console.log(greeting);',
	'  return greeting;',
	'}'
].join('\n');

const last = [
	'function greet(name: string) {',
	'  const greeting = `Hi ${name}`;',
	'  const upper = greeting.toUpperCase();',
	'  console.log(upper);',
	'  return greeting;',
	'}'
].join('\n');

const lastLines = last.split('\n');
const minCols = Math.max(...lastLines.map((line) => line.length));
const minLines = lastLines.length;

export default defineScene(
	'code',
	function* (s) {
		s.h2('Code', { y: -340 });

		const code = s.code({
			id: 'code',
			y: 50,
			code: first,
			language: 'typescript',
			fontSize: 28,
			lineHeight: 1.6,
			minCols,
			minLines,
			opacity: 0,
			scale: 0.97
		});

		const ctx = getMeasureContext();
		const firstSize = code.measure(ctx);
		code.code(last);
		const lastSize = code.measure(ctx);
		code.code(first);
		code.detach();

		const width = Math.max(firstSize.width, lastSize.width);
		const height = Math.max(firstSize.height, lastSize.height);

		const panel = s.rect({
			y: 50,
			width: width + 104,
			height: height + 80,
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
			scale: 0.97
		});

		s.add(code);

		yield* all(
			code.opacity.to(1, 0.5),
			code.scale.to(1, 0.5, easeOut),
			panel.opacity.to(1, 0.5),
			panel.scale.to(1, 0.5, easeOut)
		);
		yield* wait(0.35);

		// rename the function, then change the greeting inside the template
		yield* code.replaceText('hello', 'greet', 0.5, easeInOut);
		yield* wait(0.25);
		yield* code.replaceText('Hello', 'Hi', 0.4, easeInOut);
		yield* wait(0.25);

		// add a new line and push the lines below it down
		yield* code.insertText(
			'  const upper = greeting.toUpperCase();\n',
			position(2, 0),
			0.6,
			easeInOut
		);
		yield* wait(0.25);

		// show the new value being used on the next line
		yield* code.replaceText('console.log(greeting);', 'console.log(upper);', 0.5, easeInOut);
		yield* wait(1.1);
	},
	{
		chapter: 'Code',
		notes:
			'Code is highlighted with twinkleplop and drawn on the canvas. Each step makes one visible edit. The function is renamed, the greeting changes, a line is inserted, and the new value is logged.',
		transition: { type: 'slide', duration: 0.8 }
	}
);
