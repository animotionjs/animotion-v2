<script lang="ts">
	import { getSceneManager, getOptions } from '../scene/index.js';

	interface Props {
		/** Scene content. */
		children: import('svelte').Snippet;
	}

	let { children }: Props = $props();
	const manager = getSceneManager();
	const transition = manager.transitionState;
	const { aspectRatio } = getOptions();
	const ratio = aspectRatio.width / aspectRatio.height;
	const transform = $derived(
		`translate(${transition.x}cqi, ${transition.y}cqi) scale(${transition.scale})`
	);
</script>

<section
	class="@container flex flex-col items-center justify-center overflow-hidden text-foreground"
	style:width="min(100dvw, calc(100dvh * {ratio}))"
	style:aspect-ratio={ratio}
	style:opacity={transition.opacity}
	style:transform
>
	{@render children()}
</section>
