<script lang="ts">
	import { getSceneManager, getOptions } from '../scene/index.js';
	import type { Snippet } from 'svelte';

	interface Props {
		/** Scene content. */
		children: Snippet;
		/** Aspect ratio (width ÷ height) override; defaults to the configured aspect ratio. */
		ratio?: number;
		/**
		 * `'viewport'` sizes the scene to the presentation viewport; `'contain'`
		 * fills the parent box instead, for embedders like the timeline preview
		 * that size the stage themselves.
		 */
		fit?: 'viewport' | 'contain';
	}

	let { children, ratio, fit = 'viewport' }: Props = $props();
	const manager = getSceneManager();
	const transition = manager.transitionState;
	const { aspectRatio } = getOptions();
	const aspect = $derived(ratio ?? aspectRatio.width / aspectRatio.height);
	const contained = $derived(fit === 'contain');
	const transform = $derived(
		`translate(${transition.x}cqi, ${transition.y}cqi) scale(${transition.scale})`
	);
</script>

<section
	class="@container flex flex-col items-center justify-center overflow-hidden text-foreground"
	style:width={contained ? '100%' : `min(100dvw, calc(100dvh * ${aspect}))`}
	style:height={contained ? '100%' : null}
	style:aspect-ratio={aspect}
	style:opacity={transition.opacity}
	style:transform
>
	{@render children()}
</section>
