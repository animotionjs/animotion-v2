<script lang="ts">
	import { getSceneManager, getOptions } from '../scene/index.js';

	interface Props {
		/** Scene content. */
		children: import('svelte').Snippet;
		/** Fill the parent container instead of the viewport, for scaled previews. */
		compact?: boolean;
	}

	let { children, compact = false }: Props = $props();
	const manager = getSceneManager();
	const transition = manager.transitionState;
	const { aspectRatio } = getOptions();
	const ratio = aspectRatio.width / aspectRatio.height;
	const transform = $derived(
		`translate(${transition.x}cqi, ${transition.y}cqi) scale(${transition.scale})`
	);
	const width = $derived(compact ? '100%' : `min(100dvw, calc(100dvh * ${ratio}))`);
</script>

<section
	class="@container flex flex-col items-center justify-center overflow-hidden p-8 text-foreground"
	style:width
	style:aspect-ratio={ratio}
	style:opacity={transition.opacity}
	style:transform
>
	{@render children()}
</section>
