<script lang="ts">
	import { getSceneManager } from '#lib/scene';

	let { children } = $props();
	const manager = getSceneManager();
	const transition = manager.transitionState;
	const transform = $derived(
		`translate(${transition.x}cqi, ${transition.y}cqi) scale(${transition.scale})`
	);
</script>

<section
	class="@container flex aspect-video w-[min(100dvw,calc(100dvh*16/9))] flex-col items-center justify-center overflow-hidden p-8 text-white"
	style:opacity={transition.opacity}
	style:transform
>
	{@render children()}
</section>
