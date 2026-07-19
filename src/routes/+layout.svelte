<script lang="ts">
	import { page } from '$app/state';
	import { deck } from '$lib/slides/config';
	import { goto } from '$app/navigation';
	import favicon from '$lib/assets/favicon.svg';
	import './theme.css';

	let { children } = $props();
	let index = $derived(deck.findIndex((s) => s.slug === page.params.slug));
</script>

<svelte:head>
	<title>Slides</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'ArrowRight' && index < deck.length - 1) {
			goto('/' + deck[index + 1].slug);
		}
		if (e.key === 'ArrowLeft' && index > 0) {
			goto('/' + deck[index - 1].slug);
		}
	}}
/>

<div class="flex h-dvh w-dvw items-center justify-center overflow-hidden bg-black">
	{@render children()}
</div>

<div class="fixed right-0 bottom-0 left-0 z-10 bg-zinc-800 h-[4px]">
	<div
		class="h-full bg-amber-400 transition-all"
		style:width="{((index + 1) / deck.length) * 100}%"
	></div>
</div>
