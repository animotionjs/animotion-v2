<script lang="ts">
	import { page } from '$app/state';
	import { sequence } from '#lib/config/scenes';
	import { SpeakerView } from '#lib/plugins';

	const channel = $derived(page.url.searchParams.get('channel') ?? undefined);
</script>

<SpeakerView {sequence} {channel} />
