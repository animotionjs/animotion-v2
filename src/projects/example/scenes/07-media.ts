import { all, defineScene, easeInOut, easeOut, tick, wait } from '#lib/canvas/index.js';

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
					{ offset: 1, color: 'rgba(56, 189, 248, 0)' }
				]
			},
			opacity: 0
		});

		const image = s.image({
			src: '/media/aurora.png',
			width: 600,
			height: 340,
			fit: 'cover',
			radius: 24
		});

		const video = s.video({
			src: '/media/aurora.mp4',
			width: 600,
			height: 340,
			fit: 'cover',
			radius: 24
		});

		const imageCard = s.card(
			{
				x: -370,
				y: 10,
				width: 680,
				height: 440,
				radius: 32,
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
				scale: 0.96
			},
			image,
			s.text('Image node', {
				y: 176,
				fontSize: 24,
				fontWeight: 600,
				fill: '#e4e4e7'
			})
		);

		const videoCard = s.card(
			{
				x: 370,
				y: 10,
				width: 680,
				height: 440,
				radius: 32,
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
				scale: 0.96
			},
			video,
			s.text('Video node', {
				y: 176,
				fontSize: 24,
				fontWeight: 600,
				fill: '#e4e4e7'
			})
		);

		const paragraph = s.body(
			'Images and video are first class canvas nodes. Media is clipped to rounded corners and fitted inside its box, while the scene clock seeks the video to the frame on screen.',
			{
				y: 352,
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

		yield* tick(
			({ progress }) => {
				const scale = 1 + progress * 0.04;
				image.scale(scale);
				video.scale(scale);
			},
			2.2,
			easeInOut
		);

		yield* wait(0.3);
		yield* s.frame(videoCard, { zoom: 1.12, duration: 0.9, ease: easeInOut });
		yield* wait(0.6);
		yield* s.frame({ x: 0, y: 0 }, { zoom: 1, duration: 0.7, ease: easeInOut });
		yield* wait(0.2);
	},
	{
		chapter: 'Media',
		notes:
			'Image and video nodes draw into the canvas with rounded clipping and cover fitting. The video follows the scene clock, so seeking and rendering land on the same frame. A sound cue plays through the editor and presentation audio players.',
		transition: { type: 'fade', duration: 0.6 }
	}
);
