<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import { PluginManager } from '#lib/plugins/manager.svelte';
	import { setSceneManager } from '#lib/scene/context.svelte';
	import { SceneManager } from '#lib/scene/runtime.svelte';
	import { deck } from '#lib/slides/config';
	import { plugins } from '#lib/slides/plugins';
	import '../styles/theme.css';

	let { children } = $props();

	const manager = new SceneManager();
	setSceneManager(manager);

	const pluginManager = new PluginManager({ manager, deck, navigateTo, next, prev });
	for (const plugin of plugins) pluginManager.register(plugin);

	onMount(() => {
		pluginManager.setup();
		return () => pluginManager.cleanup();
	});

	afterNavigate(() => {
		pluginManager.emitSlideChange({ slug, index });
	});

	if (typeof window !== 'undefined' && page.url.searchParams.get('render') === 'video') {
		const scheduler = manager.enableRenderMode();
		window.__deckRenderer = {
			manager,
			scheduler,
			slides: deck.map((s) => s.slug),
			navigateTo,
			advanceFrame: (delta: number) => manager.advanceFrame(delta)
		};
	}

	const slug = $derived(page.params.slug ?? deck[0].slug);
	const index = $derived(deck.findIndex((s) => s.slug === slug));
	const progress = $derived(((index + manager.completion) / deck.length) * 100);
	const showProgressBar = $derived(
		page.url.searchParams.get('render') !== 'video' || page.url.searchParams.get('progress') === '1'
	);

	function navigateTo(targetSlug: string) {
		const path = '/' + targetSlug;
		const params = page.url.searchParams.toString();
		if (!params) return goto(path);
		return goto(path + '?' + params);
	}

	function next() {
		if (manager.exitBusy) return;
		if (manager.finished) {
			if (index >= deck.length - 1) return;
			manager.saveState(slug);
			manager.setDirection('forward');
			manager.playExit().then(() => navigateTo(deck[index + 1].slug));
		} else {
			manager.next();
		}
	}

	function prev() {
		if (manager.exitBusy) return;
		if (manager.atStart) {
			if (index <= 0) return;
			manager.saveState(slug);
			manager.setDirection('backward');
			manager.playExit().then(() => navigateTo(deck[index - 1].slug));
		} else {
			manager.prev();
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if (pluginManager.handleKeydown(e)) return;
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

{#if showProgressBar}
	<div class="fixed right-0 bottom-0 left-0 z-10 h-[4px] bg-zinc-800">
		<div class="h-full bg-amber-400 transition-all" style:width="{progress}%"></div>
	</div>
{/if}
