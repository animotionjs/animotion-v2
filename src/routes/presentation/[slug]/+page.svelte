<script lang="ts">
	import { page } from '$app/state';
	import { Scenes } from '#lib';
	import MissingPresentation from '#lib/components/MissingPresentation.svelte';
	import { sequenceFor } from '#lib/config/scenes';

	let { data } = $props();

	const slug = $derived(page.params.slug ?? '');
	const sequence = $derived(sequenceFor(slug));
	const embed = $derived(page.url.searchParams.has('embed'));
</script>

<svelte:head>
	<title>{sequence.length === 0 ? 'Presentation not found' : data.name} · Slides</title>
</svelte:head>

{#if sequence.length === 0}
	<MissingPresentation {slug} />
{:else}
	<Scenes {sequence} {slug} {embed} />
{/if}
