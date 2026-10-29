<script lang="ts">
	import { page } from '$app/state';
	import SpeakerView from '#lib/components/SpeakerView.svelte';

	let { data } = $props();

	const slug = $derived(page.params.slug ?? '');
</script>

<svelte:head>
	<title>Speaker view · {data.name}</title>
</svelte:head>

<SpeakerView {slug} />
