import { all, defineScene, spring, wait } from '#lib/canvas/index.js';

const dots = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
	'<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="7" cy="7" r="2" fill="#38bdf8" opacity="0.7"/><circle cx="21" cy="21" r="2" fill="#fbbf24" opacity="0.7"/></svg>'
)}`;

const logo = `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
	<defs>
		<linearGradient id="spark" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#fbbf24"/>
			<stop offset="1" stop-color="#38bdf8"/>
		</linearGradient>
	</defs>
	<path d="M48 8 L57 39 L88 48 L57 57 L48 88 L39 57 L8 48 L39 39 Z" fill="url(#spark)"/>
	<circle cx="48" cy="48" r="10" fill="#09090b"/>
</svg>`;

export default defineScene(
	'primitives',
	function* (s) {
		s.h2('Primitives', { y: -390 });

		s.body('Shapes, paints, and assets drawn directly on the canvas.', {
			y: -320,
			fontSize: 23,
			fill: '#71717a'
		});

		const cards = [
			s.card(
				{
					x: -560,
					y: 20,
					width: 420,
					height: 290,
					radius: 34,
					smoothness: 0.65,
					cache: true,
					cachePadding: 96,
					clip: true,
					fill: {
						type: 'linear',
						from: { x: 0, y: 0 },
						to: { x: 1, y: 1 },
						stops: [
							{ offset: 0, color: '#171b22' },
							{ offset: 1, color: '#0d1014' }
						]
					},
					stroke: 'rgba(255, 255, 255, 0.09)',
					strokeWidth: 1,
					shadow: { color: 'rgba(0, 0, 0, 0.5)', blur: 38, offsetY: 18 },
					opacity: 0,
					scale: 0.94
				},
				s.svg({ markup: logo, y: -42, width: 128, height: 128 }),
				s.text('SVG', { y: 58, fontSize: 28, fontWeight: 700, fill: '#fafafa' }),
				s.text('inline markup', { y: 96, fontSize: 19, fill: '#a1a1aa' })
			),
			s.card(
				{
					x: 0,
					y: 20,
					width: 420,
					height: 290,
					radius: 34,
					smoothness: 0.65,
					cache: true,
					cachePadding: 96,
					clip: true,
					fill: {
						type: 'linear',
						from: { x: 0, y: 0 },
						to: { x: 1, y: 1 },
						stops: [
							{ offset: 0, color: '#201a12' },
							{ offset: 1, color: '#12100d' }
						]
					},
					stroke: 'rgba(255, 255, 255, 0.09)',
					strokeWidth: 1,
					shadow: { color: 'rgba(0, 0, 0, 0.5)', blur: 38, offsetY: 18 },
					opacity: 0,
					scale: 0.94
				},
				s.circle({
					radius: 78,
					y: -46,
					fill: {
						type: 'pattern',
						image: dots,
						repetition: 'repeat',
						scale: 1
					},
					stroke: {
						type: 'conic',
						startAngle: -Math.PI / 2,
						stops: [
							{ offset: 0, color: '#fbbf24' },
							{ offset: 0.5, color: '#38bdf8' },
							{ offset: 1, color: '#fbbf24' }
						]
					},
					strokeWidth: 9
				}),
				s.text('Paints', { y: 58, fontSize: 28, fontWeight: 700, fill: '#fafafa' }),
				s.text('conic and pattern', { y: 96, fontSize: 19, fill: '#a1a1aa' })
			),
			s.card(
				{
					x: 560,
					y: 20,
					width: 420,
					height: 290,
					radius: 34,
					smoothness: 0.65,
					cache: true,
					cachePadding: 96,
					clip: true,
					fill: {
						type: 'linear',
						from: { x: 0, y: 0 },
						to: { x: 1, y: 1 },
						stops: [
							{ offset: 0, color: '#101b20' },
							{ offset: 1, color: '#0c1114' }
						]
					},
					stroke: 'rgba(255, 255, 255, 0.09)',
					strokeWidth: 1,
					shadow: { color: 'rgba(0, 0, 0, 0.5)', blur: 38, offsetY: 18 },
					opacity: 0,
					scale: 0.94
				},
				s.spline({
					points: [
						{ x: -130, y: 6 },
						{ x: -80, y: -68 },
						{ x: -20, y: -4 },
						{ x: 42, y: -72 },
						{ x: 108, y: -8 }
					],
					tension: 0.9,
					stroke: '#38bdf8',
					strokeWidth: 5
				}),
				s.bezier({
					points: [
						{ x: -130, y: -48 },
						{ x: -70, y: 36 },
						{ x: 60, y: -108 },
						{ x: 126, y: -22 }
					],
					stroke: '#fbbf24',
					strokeWidth: 4
				}),
				s.text('Curves', { y: 58, fontSize: 28, fontWeight: 700, fill: '#fafafa' }),
				s.text('spline and bezier', { y: 96, fontSize: 19, fill: '#a1a1aa' })
			)
		];

		yield* all(
			...cards.map((card) => card.opacity.to(1, 0.5)),
			...cards.map((card) => card.scale.to(1, 0.8, spring({ stiffness: 140, damping: 17 })))
		);
		yield* wait(1.2);
	},
	{
		chapter: 'Primitives',
		notes:
			'Circles, splines, beziers, polygons, and SVG all draw on the canvas. The middle card combines a pattern fill with a conic gradient stroke, and the cards use smooth corners and subtree caches.',
		transition: { type: 'slide', duration: 0.55 }
	}
);
