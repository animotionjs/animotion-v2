<script lang="ts">
	import { page } from '$app/state';
	import { deck } from '#lib/slides/config';
	import Slide from '#lib/components/Slide.svelte';

	let slug = $derived(page.params.slug ?? deck[0].slug);
	let slide = $derived(deck.find((s) => s.slug === slug) ?? deck[0]);
	let { default: Content } = $derived(await slide.component());
</script>

<Slide>
	<Content />
</Slide>
