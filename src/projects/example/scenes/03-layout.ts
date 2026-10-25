import { defineScene, wait } from '#lib/canvas/index.js';

const items = ['Svelte 5', 'SvelteKit', 'Tailwind 4', 'TypeScript'];

export default defineScene(
	'layout',
	function* (s) {
		const nodes = new Map(
			items.map((item, index) => [
				item,
				s.text(item, {
					layoutKey: item,
					x: -80,
					y: -75 + index * 50,
					fontSize: 31,
					fontWeight: 400,
					fill: '#ffffff',
					align: 'left'
				})
			])
		);

		function place(order: string[]) {
			return s.layout(
				() => {
					order.forEach((item, index) => nodes.get(item)?.y(-75 + index * 50));
				},
				{ duration: 0.5, enter: 'scale' }
			);
		}

		yield* wait(0.2);
		yield* place([...items].reverse());
		yield* wait(0.2);
		yield* place([...items]);
	},
	{
		chapter: 'Layout',
		notes:
			'The layout step animates DOM changes with FLIP. Every element carries a data-layout key so the engine can match it across states. Watch the list reverse.'
	}
);
