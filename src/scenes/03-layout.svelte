<script lang="ts">
	import { createScene } from '#lib/scene';

	const scene = createScene({ order: ['Svelte 5', 'SvelteKit', 'Tailwind 4', 'TypeScript'] })
		.layout((s) => s.order.reverse(), 0.5)
		.layout((s) => s.order.reverse(), 0.5);
</script>

<div data-notes>
	The layout step animates DOM changes with FLIP. Every element carries a data-layout key so the
	engine can match it across states. Watch the list reverse.
</div>

<ul>
	{#each scene.order as item (item)}
		<li data-layout={item} class="py-2 text-2xl">{item}</li>
	{/each}
</ul>
