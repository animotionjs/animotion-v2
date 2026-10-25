import {
	all,
	defineScene,
	easeInOut,
	easeOut,
	type Paint,
	type TextNode,
	wait
} from '#lib/canvas/index.js';

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
				{ offset: 0, color: '#2a2113' },
				{ offset: 1, color: '#17130d' }
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
			x: 0,
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
					x: (index - 1) * 520,
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
					x: 0,
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

		yield* all(
			glow.opacity.to(1, 0.7),
			...nodes.map((node) => node.opacity.to(1, 0.5)),
			...nodes.map((node) => node.scale.to(1, 0.5, easeOut))
		);
		yield* wait(0.3);

		const indexLabels = nodes.map((node) => node.children[2]!);
		let body: TextNode | null = null;

		yield* s.layout(
			() => {
				const expanded = nodes[0]!;
				indexLabels[0]!.visible(false);
				expanded.x(-140);
				expanded.width(820);
				expanded.height(480);
				expanded.shadow({ color: 'rgba(0, 0, 0, 0.6)', blur: 60, offsetY: 26 });
				expanded.fill({
					type: 'linear',
					from: { x: 0, y: 0 },
					to: { x: 1, y: 1 },
					stops: [
						{ offset: 0, color: '#3a2a12' },
						{ offset: 0.55, color: '#1c1710' },
						{ offset: 1, color: '#12100d' }
					]
				});

				nodes[1]!.x(540);
				nodes[1]!.y(-80);
				nodes[1]!.width(320);
				nodes[1]!.height(300);

				nodes[2]!.x(540);
				nodes[2]!.y(260);
				nodes[2]!.width(320);
				nodes[2]!.height(300);

				body = s.text(
					'Cards are keyed layout nodes. Their size and position glide to a new state while their children follow. Gradients, rounded corners, and shadows are painted straight into the canvas.',
					{
						layoutKey: 'body',
						x: -140,
						y: 96,
						maxWidth: 640,
						lineHeight: 1.5,
						fontSize: 26,
						fill: '#d4d4d8'
					}
				);
				expanded.add(body);
			},
			{ duration: 0.8, enter: 'fade', exit: 'fade', ease: easeInOut }
		);

		yield* wait(1.4);

		yield* s.layout(
			() => {
				body?.detach();
				indexLabels[0]!.visible(true);
				nodes[0]!.x(-520);
				nodes[0]!.y(20);
				nodes[0]!.width(380);
				nodes[0]!.height(300);
				nodes[0]!.shadow({ color: 'rgba(0, 0, 0, 0.45)', blur: 34, offsetY: 16 });
				nodes[0]!.fill(cards[0]!.fill);

				nodes[1]!.x(0);
				nodes[1]!.y(20);
				nodes[1]!.width(380);
				nodes[1]!.height(300);

				nodes[2]!.x(520);
				nodes[2]!.y(20);
				nodes[2]!.width(380);
				nodes[2]!.height(300);
			},
			{ duration: 0.8, ease: easeInOut }
		);
		yield* wait(0.3);
	},
	{
		chapter: 'Morph',
		notes:
			'A keyed layout step morphs one card into a larger panel while the other cards reflow. The expanded card uses a gradient fill, a shadow, and wrapped body text.',
		transition: { type: 'zoom', duration: 0.6, scale: 0.9 }
	}
);
