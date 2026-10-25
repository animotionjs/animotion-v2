<script lang="ts">
	import { onMount } from 'svelte';
	import { CanvasRenderer } from './renderer.js';
	import type { SceneInstance } from './scene.js';

	interface Props {
		scene: SceneInstance;
		time: number;
		width?: number;
		height?: number;
		background?: string;
	}

	let { scene, time, width = 1920, height = 1080, background = '#09090b' }: Props = $props();

	let canvas: HTMLCanvasElement | undefined;
	let renderer = $state<CanvasRenderer | null>(null);

	onMount(() => {
		if (!canvas) return;
		renderer = new CanvasRenderer(canvas, scene, { width, height, background });
		return () => {
			renderer = null;
		};
	});

	/*
		Painting is an external side effect. The canvas only exists after mount,
		and the playhead owns the frame, so an effect is the last resort here.
	*/
	$effect(() => {
		const current = renderer;
		if (!current) return;
		current.draw(time);
	});
</script>

<canvas bind:this={canvas} class="block w-full" style:aspect-ratio="{width} / {height}"></canvas>
