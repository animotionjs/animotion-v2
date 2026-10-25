import { defineScene, easeInOut, tick } from '#lib/canvas/index.js';

export default defineScene(
	'tick',
	function* (s) {
		s.text('tick step', {
			y: -170.5,
			fontSize: 67.2,
			fontWeight: 700,
			fill: '#ffffff'
		});

		s.text('progress', {
			x: -341.33,
			y: -68.45,
			fontSize: 30.72,
			fill: '#9ca3af',
			align: 'left'
		});

		const percent = s.text('0%', {
			x: 341.33,
			y: -68.45,
			fontSize: 30.72,
			fill: '#ffffff',
			align: 'right'
		});

		s.rect({
			y: -28.8,
			width: 682.67,
			height: 19.2,
			radius: 9.6,
			fill: '#27272a'
		});

		const bar = s.rect({
			x: -341.33,
			y: -28.8,
			width: 0,
			height: 19.2,
			radius: 9.6,
			fill: '#fbbf24'
		});

		s.text('time', {
			y: 49.27,
			fontSize: 30.72,
			fill: '#9ca3af'
		});

		const seconds = s.text('0.0s', {
			y: 160.95,
			fontSize: 86.4,
			fontWeight: 700,
			fill: '#ffffff'
		});

		yield* tick(
			({ progress, time }) => {
				const width = progress * 682.67;
				bar.width(width);
				bar.x(-341.33 + width / 2);
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
			'The tick step runs a callback every frame with progress, time, deltaTime, and frame, letting you drive arbitrary state like a progress bar and a counter.',
		transition: { type: 'slide', duration: 0.45 }
	}
);
