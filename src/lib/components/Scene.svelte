<script lang="ts">
	import { getSceneManager, getOptions } from '../scene/index.js';

	let { children } = $props();
	const manager = getSceneManager();
	const transition = manager.transitionState;
	const { aspectRatio } = getOptions();
	const ratio = aspectRatio.width / aspectRatio.height;
	const transform = $derived(
		`translate(${transition.x}cqi, ${transition.y}cqi) scale(${transition.scale})`
	);
</script>

<section
	class="@container flex flex-col items-center justify-center overflow-hidden p-8 text-foreground"
	style:width="min(100dvw, calc(100dvh * {ratio}))"
	style:aspect-ratio={ratio}
	style:opacity={transition.opacity}
	style:transform
>
	{@render children()}
</section>
