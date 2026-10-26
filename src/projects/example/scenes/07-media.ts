import { all, defineScene, easeOut, wait } from '#lib/canvas/index.js';

export default defineScene(
	'media',
	function* (s) {
		s.sound('/media/chime.wav', { at: 0.25, volume: 0.35 });
		s.h2('Media', { y: -400 });

		const glow = s.rect({
			y: 20,
			width: 1600,
			height: 700,
			fill: {
				type: 'radial',
				stops: [
					{ offset: 0, color: 'rgba(56, 189, 248, 0.14)' },
					{ offset: 0.55, color: 'rgba(56, 189, 248, 0)' },
					{ offset: 1, color: 'rgba(56, 189, 248, 0)' }
				]
			},
			opacity: 0
		});

		const image = s.image({
			src: '/media/aurora.png',
			y: -35,
			width: 620,
			height: 360,
			fit: 'cover',
			radius: 24,
			smoothness: 0.35
		});

		const video = s.video({
			src: '/media/aurora-motion.mp4',
			y: -35,
			width: 620,
			height: 360,
			fit: 'cover',
			radius: 24,
			smoothness: 0.35,
			smoothing: true
		});

		const imageCard = s.card(
			{
				x: -380,
				y: 20,
				width: 700,
				height: 500,
				radius: 32,
				smoothness: 0.5,
				fill: {
					type: 'linear',
					from: { x: 0, y: 0 },
					to: { x: 1, y: 1 },
					stops: [
						{ offset: 0, color: '#151b22' },
						{ offset: 1, color: '#0e1116' }
					]
				},
				stroke: 'rgba(255, 255, 255, 0.09)',
				strokeWidth: 1,
				shadow: { color: 'rgba(0, 0, 0, 0.5)', blur: 46, offsetY: 20 },
				opacity: 0,
				scale: 0.97
			},
			image,
			s.text('Image node', {
				y: 205,
				fontSize: 24,
				fontWeight: 600,
				fill: '#e4e4e7'
			})
		);

		const videoCard = s.card(
			{
				x: 380,
				y: 20,
				width: 700,
				height: 500,
				radius: 32,
				smoothness: 0.5,
				fill: {
					type: 'linear',
					from: { x: 0, y: 0 },
					to: { x: 1, y: 1 },
					stops: [
						{ offset: 0, color: '#161a22' },
						{ offset: 1, color: '#0e1116' }
					]
				},
				stroke: 'rgba(255, 255, 255, 0.09)',
				strokeWidth: 1,
				shadow: { color: 'rgba(0, 0, 0, 0.5)', blur: 46, offsetY: 20 },
				opacity: 0,
				scale: 0.97
			},
			video,
			s.text('Video node', {
				y: 205,
				fontSize: 24,
				fontWeight: 600,
				fill: '#e4e4e7'
			})
		);

		const paragraph = s.body(
			'Images and video are first class canvas nodes. Media is clipped to rounded corners and fitted inside its box. While the scene plays the video runs natively and corrects drift against the clock, then seeks exactly when paused or rendered.',
			{
				y: 390,
				maxWidth: 1180,
				lineHeight: 1.45,
				fontSize: 25,
				opacity: 0
			}
		);

		yield* all(
			glow.opacity.to(1, 0.7),
			imageCard.opacity.to(1, 0.5),
			imageCard.scale.to(1, 0.5, easeOut),
			videoCard.opacity.to(1, 0.5),
			videoCard.scale.to(1, 0.5, easeOut),
			paragraph.opacity.to(1, 0.6)
		);
		yield* wait(3);
	},
	{
		chapter: 'Media',
		notes:
			'Image and video nodes draw into the canvas with rounded clipping and cover fitting. The video plays natively while the scene clock runs and seeks exactly during scrubbing and rendering, and smoothing keeps its scaled frames soft. A sound cue plays through the editor and presentation audio players.',
		transition: { type: 'fade', duration: 0.6 }
	}
);
