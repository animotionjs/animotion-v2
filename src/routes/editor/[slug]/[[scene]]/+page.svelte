<script lang="ts">
	import { page } from '$app/state';
	import { EditorView } from '#lib';
	import MissingPresentation from '#lib/components/MissingPresentation.svelte';
	import { sequenceFor } from '#lib/config/scenes';

	const slug = $derived(page.params.slug ?? '');
	const sequence = $derived(sequenceFor(slug));
	const sceneId = $derived(page.params.scene ?? undefined);
</script>

{#if sequence.length === 0}
	<MissingPresentation {slug} />
{:else}
	<EditorView {sequence} {sceneId} project={slug} />
{/if}
