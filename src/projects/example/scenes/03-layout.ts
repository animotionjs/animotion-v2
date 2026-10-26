import { defineScene, getMeasureContext } from '#lib/canvas/index.js';

const items = ['Svelte 5', 'SvelteKit', 'Tailwind 4', 'TypeScript'];

export default defineScene(
	'layout',
	function* (s) {
		const nodes = new Map(
			items.map((item) => [
				item,
				s.text(item, {
					layoutKey: item,
					fontSize: 30.72,
					fontWeight: 400,
					fill: '#ffffff',
					align: 'left'
				})
			])
		);

		const ctx = getMeasureContext();
		const width = Math.max(...items.map((item) => nodes.get(item)!.measure(ctx).width));
		const top = -90.24;
		const gap = 60.16;

		items.forEach((item, index) => {
			const node = nodes.get(item)!;
			node.x(-width / 2);
			node.y(top + index * gap);
		});

		function place(order: string[]) {
			return s.layout(
				() => {
					order.forEach((item, index) => nodes.get(item)!.y(top + index * gap));
				},
				{ duration: 0.5 }
			);
		}

		yield* place([...items].reverse());
		yield* place([...items]);
	},
	{
		chapter: 'Layout',
		notes:
			'The layout step glides keyed nodes between measured positions. Every node carries a layout key so the engine can match it across states. Watch the list reverse.',
		transition: { type: 'fade', duration: 0.45 }
	}
);
