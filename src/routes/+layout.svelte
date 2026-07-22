<script lang="ts">
	import { page } from '$app/state';
	import { deck } from '#lib/slides/config';
	import { goto } from '$app/navigation';
	import favicon from '#lib/assets/favicon.svg';
	import { SceneManager } from '#lib/timeline/runtime.svelte';
	import { setSceneManager } from '#lib/timeline/context.svelte';
	import './theme.css';

	let { children } = $props();
	let index = $derived(deck.findIndex((s) => s.slug === page.params.slug));

	const manager = new SceneManager();
	setSceneManager(manager);
</script>

<svelte:head>
	<title>Slides</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'ArrowRight') {
			e.preventDefault();
			if (manager.finished) {
				if (index < deck.length - 1) goto('/' + deck[index + 1].slug);
			} else {
				manager.next();
			}
		}
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			if (manager.step === 0) {
				if (index > 0) goto('/' + deck[index - 1].slug);
			} else {
				manager.prev();
			}
		}
	}}
/>

<div class="flex h-dvh w-dvw items-center justify-center overflow-hidden bg-black">
	{@render children()}
</div>

<div class="fixed right-0 bottom-0 left-0 z-10 h-[4px] bg-zinc-800">
	<div
		class="h-full bg-amber-400 transition-all"
		style:width="{((index + manager.completion) / deck.length) * 100}%"
	></div>
</div>
