<script lang="ts">
	import { timeline } from '#lib/timeline';

	const tl = timeline({ order: ['Svelte 5', 'SvelteKit', 'Tailwind 4', 'TypeScript'] });

	tl.layout(() => { tl.order = [...tl.order].reverse(); }, 0.5).layout(
		() => { tl.order = [...tl.order].reverse(); },
		0.5
	);
</script>

<ul>
	{#each tl.order as item (item)}
		<li data-layout={item} class="py-2 text-2xl">{item}</li>
	{/each}
</ul>
