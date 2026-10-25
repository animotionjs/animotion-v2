import { defineScene, easeInOut, tick, wait } from '#lib/canvas/index.js';

export default defineScene(
	'tick',
	function* (s) {
		s.text('tick step', {
			y: -220,
			fontSize: 64,
			fontWeight: 700,
			fill: '#ffffff'
		});

		s.text('progress', {
			x: -320,
			y: -100,
			fontSize: 27,
			fill: '#9ca3af',
			align: 'left'
		});

		const percent = s.text('0%', {
			x: 320,
			y: -100,
			fontSize: 27,
			fill: '#ffffff',
			align: 'right'
		});

		s.rect({
			y: -40,
			width: 640,
			height: 16,
			radius: 8,
			fill: '#27272a'
		});

		const bar = s.rect({
			x: -320,
			y: -40,
			width: 0.01,
			height: 16,
			radius: 8,
			fill: '#fbbf24'
		});

		s.text('time', {
			y: 80,
			fontSize: 27,
			fill: '#9ca3af'
		});

		const seconds = s.text('0.0s', {
			y: 150,
			fontSize: 60,
			fontWeight: 700,
			fill: '#ffffff'
		});

		yield* tick(
			({ progress, time }) => {
				const width = progress * 640;
				bar.width(Math.max(0.01, width));
				bar.x(-320 + width / 2);
				percent.text(`${Math.round(progress * 100)}%`);
				seconds.text(`${time.toFixed(1)}s`);
			},
			2.4,
			easeInOut
		);

		yield* wait(0.4);
	},
	{
		chapter: 'Tick',
		notes:
			'The tick step runs a callback every frame with progress, time, deltaTime, and frame, letting you drive arbitrary state like a progress bar and a counter.'
	}
);
