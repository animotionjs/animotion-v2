<script lang="ts">
	import { onMount } from 'svelte';
	import { toUiTimeline, type UiTimeline } from './ui.js';
	import type { SceneEntry } from '../scene/runtime/sequence.js';

	interface Props {
		entry: SceneEntry;
		onmeasured: (id: string, timeline: UiTimeline, chapter: string) => void;
	}

	let { entry, onmeasured }: Props = $props();

	onMount(() => {
		if (!entry.definition) return;
		onmeasured(entry.id, toUiTimeline(entry.definition.timeline()), entry.chapter ?? '');
	});
</script>
