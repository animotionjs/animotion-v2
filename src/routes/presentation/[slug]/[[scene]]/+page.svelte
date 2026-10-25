<script lang="ts">
	import { page } from '$app/state';
	import { CanvasScenes, Scenes, SpeakerView } from '#lib';
	import MissingPresentation from '#lib/components/MissingPresentation.svelte';
	import { plugins } from '#lib/config/plugins';
	import { projectFor, sequenceFor } from '#lib/config/scenes';

	const slug = $derived(page.params.slug ?? '');
	const base = $derived(`/presentation/${slug}`);
	const project = $derived(projectFor(slug));
	const sequence = $derived(sequenceFor(slug));
	const isSpeaker = $derived(page.url.searchParams.has('speaker'));
	const session = $derived(page.url.searchParams.get('session') ?? undefined);
</script>

{#if isSpeaker && !project}
	<SpeakerView {session} {base} />
{:else if project}
	<CanvasScenes {project} />
{:else if sequence.length === 0}
	<MissingPresentation {slug} />
{:else}
	<Scenes {sequence} {plugins} {base} />
{/if}
