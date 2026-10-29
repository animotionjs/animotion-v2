<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { getSlide } from '../slides/context.svelte.js';
	import {
		playSceneTransition,
		type SceneDirection,
		type SceneTransition
	} from '../slides/transitions.js';

	interface Props {
		children: Snippet;
		enter?: SceneTransition;
		direction?: SceneDirection;
		duration?: number;
	}

	let { children, enter = 'slide', direction = 'forward', duration = 450 }: Props = $props();

	const runtime = getSlide();
	let root: HTMLElement;

	onMount(() => {
		runtime.setRoot(root);
		root.style.visibility = 'visible';
		playSceneTransition(root, enter, 'enter', direction, duration);
		return () => runtime.release(root);
	});
</script>

<div bind:this={root} class="relative h-full w-full bg-background" style:visibility="hidden">
	{@render children()}
</div>
