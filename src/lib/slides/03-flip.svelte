<script lang="ts">
	import { flip, pause, scene, signal } from '#lib/timeline';

	let order = signal(['Svelte 5', 'SvelteKit', 'Tailwind 4', 'TypeScript']);

	scene(function* () {
		yield* flip(() => order([...order()].reverse()), 0.5);
		yield pause();
		yield* flip(() => order([...order()].reverse()), 0.5);
		yield pause();
	});
</script>

<ul>
	{#each order() as item (item)}
		<li data-flip-key={item} class="py-2 text-2xl">{item}</li>
	{/each}
</ul>
