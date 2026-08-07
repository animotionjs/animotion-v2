<script lang="ts">
	import { page } from '$app/state';
	import { Scenes } from '#lib';
	import { SPEAKER_CHANNEL, speakerPlugin } from '#lib/plugins';
	import { plugins } from '#lib/config/plugins';
	import { sequence } from '#lib/config/scenes';

	// When loaded as an embedded mirror (?embed=1&channel=...), register only
	// the speaker plugin in receiver mode so the window follows the presenter's
	// broadcasts instead of broadcasting its own.
	const channel = $derived(page.url.searchParams.get('channel') ?? SPEAKER_CHANNEL);
	const activePlugins = $derived(
		page.url.searchParams.get('embed') === '1' ? [speakerPlugin({ embed: true, channel })] : plugins
	);
</script>

<Scenes {sequence} plugins={activePlugins} />
