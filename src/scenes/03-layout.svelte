<script module lang="ts">
	export { notes };
</script>

<script lang="ts">
	import { createScene } from '#lib/scene';

	const scene = createScene({ order: ['Svelte 5', 'SvelteKit', 'Tailwind 4', 'TypeScript'] })
		.layout(() => scene.order.reverse(), 0.5)
		.layout(() => scene.order.reverse(), 0.5);
</script>

{#snippet notes()}
	The layout step animates DOM changes with FLIP. Every element carries a data-layout key so the
	engine can match it across states. Watch the list reverse.
{/snippet}

<ul>
	{#each scene.order as item (item)}
		<li data-layout={item} class="py-2 text-2xl">{item}</li>
	{/each}
</ul>
