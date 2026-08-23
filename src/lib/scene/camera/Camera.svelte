<script lang="ts">
	import { getCanvas, setCanvas } from './context';
	import type { Snippet } from 'svelte';
	import type { Camera } from './frame';

	interface Props {
		/** Canvas content, positioned absolutely inside the transformed container. */
		children: Snippet;
		/** The scene whose built-in camera drives the transform. */
		scene: { readonly camera: Camera };
	}

	let { children, scene }: Props = $props();

	function canvas(node: HTMLElement) {
		setCanvas(node);
		return () => {
			if (getCanvas() === node) setCanvas(null);
		};
	}

	const camera = $derived(
		`scale(${scene.camera.zoom}) rotate(${scene.camera.deg}deg) translate(${-scene.camera.x}px, ${-scene.camera.y}px)`
	);
</script>

<div class="relative h-full w-full overflow-hidden">
	<div class="absolute top-1/2 left-1/2" style:transform={camera} {@attach canvas}>
		{@render children()}
	</div>
</div>
