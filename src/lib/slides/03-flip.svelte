<script lang="ts">
	import { useScene, pause } from '$lib/timeline/runtime.svelte';
	import { flip } from '$lib/timeline/flip.svelte';

	let order = $state(['Svelte 5', 'SvelteKit', 'Tailwind 4', 'TypeScript']);

	useScene(function* () {
		yield* flip(() => (order = [...order].reverse()), 0.5);
		yield pause();
		yield* flip(() => (order = [...order].reverse()), 0.5);
	});
</script>

<ul>
	{#each order as item (item)}
		<li data-flip-key={item} class="py-2 text-2xl">{item}</li>
	{/each}
</ul>
