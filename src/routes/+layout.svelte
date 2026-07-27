<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { deck } from '#lib/slides/config';
	import { SceneManager } from '#lib/scene/runtime.svelte';
	import { setSceneManager } from '#lib/scene/context.svelte';
	import favicon from '#lib/assets/favicon.svg';
	import './theme.css';

	const manager = new SceneManager();
	setSceneManager(manager);

	let { children } = $props();
	const index = $derived(deck.findIndex((s) => s.slug === page.params.slug));
	const progress = $derived(((index + manager.completion) / deck.length) * 100);

	function next() {
		if (manager.finished) {
			if (index < deck.length - 1) goto('/' + deck[index + 1].slug);
		} else {
			manager.next();
		}
	}

	function prev() {
		if (manager.step === 0) {
			if (index > 0) goto('/' + deck[index - 1].slug);
		} else {
			manager.prev();
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') next();
		if (e.key === 'ArrowLeft') prev();
	}
</script>

<svelte:head>
	<title>Slides</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<svelte:window {onkeydown} />

<div class="flex h-dvh w-dvw items-center justify-center overflow-hidden bg-black">
	{@render children()}
</div>

<div class="fixed right-0 bottom-0 left-0 z-10 h-[4px] bg-zinc-800">
	<div class="h-full bg-amber-400 transition-all" style:width="{progress}%"></div>
</div>
