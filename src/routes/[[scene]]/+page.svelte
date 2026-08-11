<script lang="ts">
	import { page } from '$app/state';
	import { Scenes, SpeakerView } from '#lib';
	import { plugins } from '#lib/config/plugins';
	import { sequence } from '#lib/config/scenes';

	const isSpeaker = $derived(page.url.searchParams.has('speaker'));
	const session = $derived(page.url.searchParams.get('session') ?? undefined);
</script>

{#if isSpeaker}
	<SpeakerView {session} />
{:else}
	<Scenes {sequence} {plugins} />
{/if}
