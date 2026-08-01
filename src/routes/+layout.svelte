<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import favicon from '../assets/favicon.svg';
	import { PluginManager } from '#lib/plugins/manager.svelte';
	import { setSceneId, setSceneManager } from '#lib/scene/context.svelte';
	import { SceneManager } from '#lib/scene/runtime.svelte';
	import { sequence } from '../lib/config/scenes';
	import { plugins } from '../lib/config/plugins';
	import '../styles/theme.css';

	let { children } = $props();

	const manager = new SceneManager();
	setSceneManager(manager);

	const id = $derived(page.params.scene ?? sequence[0].id);
	const index = $derived(sequence.findIndex((s) => s.id === id));
	const progress = $derived(((index + manager.completion) / sequence.length) * 100);
	const showProgressBar = $derived(
		page.url.searchParams.get('render') !== 'video' || page.url.searchParams.get('progress') === '1'
	);

	setSceneId(() => id);

	const pluginManager = new PluginManager({ manager, sequence, navigateTo, next, prev });
	for (const plugin of plugins) pluginManager.register(plugin);

	onMount(() => {
		pluginManager.setup();
		return () => pluginManager.cleanup();
	});

	afterNavigate(() => {
		pluginManager.emitSceneChange({ id, index });
	});

	if (typeof window !== 'undefined' && page.url.searchParams.get('render') === 'video') {
		const scheduler = manager.enableRenderMode();
		window.__sequenceRenderer = {
			manager,
			scheduler,
			scenes: sequence.map((s) => s.id),
			navigateTo,
			advanceFrame: (delta: number) => manager.advanceFrame(delta)
		};
	}

	function navigateTo(targetId: string) {
		const path = '/' + targetId;
		const params = page.url.searchParams.toString();
		if (!params) return goto(path);
		return goto(path + '?' + params);
	}

	function next() {
		if (manager.exitBusy) return;
		if (manager.finished) {
			if (index >= sequence.length - 1) return;
			manager.saveState(id);
			manager.setDirection('forward');
			manager.playExit().then(() => navigateTo(sequence[index + 1].id));
		} else {
			manager.next();
		}
	}

	function prev() {
		if (manager.exitBusy) return;
		if (manager.atStart) {
			if (index <= 0) return;
			manager.saveState(id);
			manager.setDirection('backward');
			manager.playExit().then(() => navigateTo(sequence[index - 1].id));
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
	<title>Animotion</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<svelte:window {onkeydown} />

<div class="flex h-dvh w-dvw items-center justify-center overflow-hidden bg-background">
	{@render children()}
</div>

{#if showProgressBar}
	<div class="fixed right-0 bottom-0 left-0 z-10 h-[4px] bg-surface">
		<div class="h-full bg-accent transition-all" style:width="{progress}%"></div>
	</div>
{/if}
