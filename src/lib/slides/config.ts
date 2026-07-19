import type { Component } from 'svelte';

interface SlideEntry {
	slug: string;
	order: number;
	component: () => Promise<{ default: Component }>;
}

export const deck: SlideEntry[] = Object.entries(import.meta.glob('./*.svelte'))
	.map(([path, component]) => {
		const name = path.replace('./', '').replace('.svelte', '');
		const match = name.match(/^(\d+)-(.+)$/);
		return {
			slug: match ? match[2] : name,
			order: match ? parseInt(match[1]) : 999,
			component: component as () => Promise<{ default: Component }>
		};
	})
	.sort((a, b) => a.order - b.order);
