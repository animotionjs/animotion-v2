<script lang="ts">
	import { scene } from '#lib/scene';

	const s = scene({ order: ['Svelte 5', 'SvelteKit', 'Tailwind 4', 'TypeScript'] })
		.layout(() => {
			s.order = [...s.order].reverse();
		}, 0.5)
		.layout(() => {
			s.order = [...s.order].reverse();
		}, 0.5);
</script>

<ul>
	{#each s.order as item (item)}
		<li data-layout={item} class="py-2 text-2xl">{item}</li>
	{/each}
</ul>
