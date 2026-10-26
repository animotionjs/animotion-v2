import { all, defineScene, easeInOut, easeOut, type Paint, wait } from '#lib/canvas/index.js';

interface CardSpec {
	name: string;
	tag: string;
	fill: Paint;
}

const cards: CardSpec[] = [
	{
		name: 'Canvas',
		tag: 'node graph',
		fill: {
			type: 'linear',
			from: { x: 0, y: 0 },
			to: { x: 1, y: 1 },
			stops: [
				{ offset: 0, color: '#3a2a12' },
				{ offset: 0.55, color: '#1c1710' },
				{ offset: 1, color: '#12100d' }
			]
		}
	},
	{
		name: 'Timeline',
		tag: 'recorded steps',
		fill: {
			type: 'linear',
			from: { x: 0, y: 0 },
			to: { x: 1, y: 1 },
			stops: [
				{ offset: 0, color: '#101d24' },
				{ offset: 1, color: '#0d1216' }
			]
		}
	},
	{
		name: 'Audio',
		tag: 'cue sync',
		fill: {
			type: 'linear',
			from: { x: 0, y: 0 },
			to: { x: 1, y: 1 },
			stops: [
				{ offset: 0, color: '#211326' },
				{ offset: 1, color: '#140d17' }
			]
		}
	}
];

export default defineScene(
	'morph',
	function* (s) {
		s.h2('Morph', { y: -380 });

		const glow = s.rect({
			y: 80,
			width: 1500,
			height: 760,
			fill: {
				type: 'radial',
				stops: [
					{ offset: 0, color: 'rgba(251, 191, 36, 0.16)' },
					{ offset: 1, color: 'rgba(251, 191, 36, 0)' }
				]
			},
			opacity: 0
		});

		const nodes = cards.map((card, index) => {
			const node = s.card(
				{
					layoutKey: card.name,
					x: index === 0 ? 0 : index === 1 ? -520 : 520,
					y: 20,
					width: 380,
					height: 300,
					radius: 28,
					fill: card.fill,
					stroke: 'rgba(255, 255, 255, 0.08)',
					strokeWidth: 1,
					shadow: { color: 'rgba(0, 0, 0, 0.45)', blur: 34, offsetY: 16 },
					opacity: 0,
					scale: 0.96
				},
				s.text(card.name, {
					y: -72,
					fontSize: 42,
					fontWeight: 700,
					fill: '#fafafa'
				}),
				s.text(card.tag, {
					y: -14,
					fontSize: 22,
					fill: '#a1a1aa'
				}),
				s.text(`0${index + 1}`, {
					y: 106,
					fontSize: 20,
					fill: '#71717a'
				})
			);
			node.add(
				s.rect({
					y: -140,
					width: 88,
					height: 4,
					radius: 2,
					fill: {
						type: 'linear',
						from: { x: 0, y: 0 },
						to: { x: 1, y: 0 },
						stops: [
							{ offset: 0, color: '#fbbf24' },
							{ offset: 1, color: 'rgba(251, 191, 36, 0)' }
						]
					}
				})
			);
			return node;
		});

		const indexLabels = nodes.map((node) => node.children[2]!);
		const body = s.text(
			'Cards are keyed layout nodes. Their size and position glide to a new state while their children follow. Gradients, rounded corners, and shadows are painted straight into the canvas.',
			{
				x: 0,
				y: 140,
				maxWidth: 640,
				lineHeight: 1.5,
				fontSize: 26,
				fill: '#d4d4d8',
				opacity: 0
			}
		);

		yield* all(
			glow.opacity.to(1, 0.7),
			...nodes.map((node) => node.opacity.to(1, 0.5)),
			...nodes.map((node) => node.scale.to(1, 0.5, easeOut))
		);
		yield* wait(0.3);

		const expanded = nodes[0]!;

		/*
		 * The card grows through its own box signals. A keyed layout scale would
		 * stretch the text and image children along with the card during the
		 * transition, which is why only the surrounding cards use layout here.
		 */
		yield* all(
			expanded.x.to(0, 0.8, easeInOut),
			expanded.width.to(820, 0.8, easeInOut),
			expanded.height.to(480, 0.8, easeInOut),
			s.layout(
				() => {
					indexLabels[0]!.visible(false);
					nodes[1]!.x(-740);
					nodes[1]!.y(20);
					nodes[2]!.x(740);
					nodes[2]!.y(20);
				},
				{ duration: 0.8, ease: easeInOut }
			)
		);

		yield* all(body.opacity.to(1, 0.45), body.y.to(120, 0.45, easeOut));
		yield* wait(1.1);
		yield* body.opacity.to(0, 0.25, easeInOut);

		yield* all(
			expanded.x.to(0, 0.8, easeInOut),
			expanded.width.to(380, 0.8, easeInOut),
			expanded.height.to(300, 0.8, easeInOut),
			s.layout(
				() => {
					indexLabels[0]!.visible(true);
					nodes[1]!.x(-520);
					nodes[1]!.y(20);
					nodes[2]!.x(520);
					nodes[2]!.y(20);
				},
				{ duration: 0.8, ease: easeInOut }
			)
		);
		yield* wait(0.3);
	},
	{
		chapter: 'Morph',
		notes:
			'A card grows into a panel while the other cards reflow around it. The card box is tweened directly so its text stays sharp, and the surrounding cards move with a keyed layout step.',
		transition: { type: 'fade', duration: 0.5 }
	}
);
