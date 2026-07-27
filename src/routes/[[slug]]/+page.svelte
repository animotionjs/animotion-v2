<script lang="ts">
	import { page } from '$app/state';
	import { deck } from '#lib/slides/config';
	import Scene from '#lib/components/Scene.svelte';

	const slug = $derived(page.params.slug ?? deck[0].slug);
	const scene = $derived(deck.find((s) => s.slug === slug) ?? deck[0]);
	const Content = $derived((await scene.component()).default);
</script>

<Scene>
	<Content />
</Scene>
