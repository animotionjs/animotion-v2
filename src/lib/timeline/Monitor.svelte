<script lang="ts">
	import Scene from '../components/Scene.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		/** Aspect ratio (width ÷ height) of the preview stage. */
		ratio: number;
		children: Snippet;
	}

	let { ratio, children }: Props = $props();

	let boxWidth = $state(0);
	let boxHeight = $state(0);

	/*
	 * The largest stage with the picked shape that still fits the available
	 * space, recomputed when either the box or the ratio changes.
	 */
	const stageWidth = $derived(Math.floor(Math.min(boxWidth, boxHeight * ratio)));
	const stageHeight = $derived(ratio > 0 ? Math.floor(stageWidth / ratio) : 0);
</script>

<div
	bind:clientWidth={boxWidth}
	bind:clientHeight={boxHeight}
	class="flex h-full w-full items-center justify-center"
>
	<div
		class="overflow-hidden bg-black shadow-2xl"
		style:width="{stageWidth}px"
		style:height="{stageHeight}px"
	>
		<Scene {ratio} fit="contain">
			{@render children()}
		</Scene>
	</div>
</div>
