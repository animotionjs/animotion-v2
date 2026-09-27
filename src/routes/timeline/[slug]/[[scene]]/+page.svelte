<script lang="ts">
	import { page } from '$app/state';
	import { TimelineView } from '#lib';
	import MissingPresentation from '#lib/components/MissingPresentation.svelte';
	import { sequenceFor } from '#lib/config/scenes';

	const slug = $derived(page.params.slug ?? '');
	const sequence = $derived(sequenceFor(slug));
	const sceneId = $derived(page.params.scene ?? sequence[0]?.id);
	const base = $derived(`/timeline/${slug}`);
</script>

{#if sequence.length === 0}
	<MissingPresentation {slug} />
{:else if sceneId}
	<TimelineView {sequence} {sceneId} project={slug} {base} />
{/if}
