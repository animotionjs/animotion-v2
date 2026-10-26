import { defineScene, easeInOut, tick } from '#lib/canvas/index.js';

export default defineScene(
	'tick',
	function* (s) {
		s.text('tick step', {
			y: -380,
			fontSize: 67.2,
			fontWeight: 700,
			fill: '#ffffff'
		});

		s.circle({
			y: -40,
			radius: 150,
			stroke: '#27272a',
			strokeWidth: 18
		});

		const ring = s.circle({
			y: -40,
			radius: 150,
			startAngle: -90,
			endAngle: -90,
			stroke: {
				type: 'conic',
				startAngle: -Math.PI / 2,
				stops: [
					{ offset: 0, color: '#fbbf24' },
					{ offset: 0.55, color: '#38bdf8' },
					{ offset: 1, color: '#fbbf24' }
				]
			},
			strokeWidth: 18
		});

		const percent = s.text('0%', {
			y: -40,
			fontSize: 72,
			fontWeight: 700,
			fill: '#ffffff'
		});

		s.text('progress', {
			y: 154,
			fontSize: 30.72,
			fill: '#9ca3af'
		});

		const seconds = s.text('0.0s', {
			y: 238,
			fontSize: 67.2,
			fontWeight: 700,
			fill: '#ffffff'
		});

		yield* tick(
			({ progress, time }) => {
				ring.endAngle(-90 + progress * 360);
				percent.text(`${Math.round(progress * 100)}%`);
				seconds.text(`${time.toFixed(1)}s`);
			},
			2.4,
			easeInOut
		);
	},
	{
		chapter: 'Tick',
		notes:
			'The tick step runs a callback every frame with progress, time, deltaTime, and frame. Here it drives a conic gradient progress ring and a counter.',
		transition: { type: 'slide', duration: 0.45 }
	}
);
