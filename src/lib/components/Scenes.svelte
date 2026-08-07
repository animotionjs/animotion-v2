<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SceneManager } from '../scene/runtime/runtime.svelte.js';
	import { setSceneId, setSceneManager } from '../scene/runtime/context.svelte.js';
	import { getOptions } from '../scene/index.js';
	import type { Sequence } from '../scene/runtime/sequence.js';
	import { PluginManager } from '../plugins/manager.svelte.js';
	import type { Plugin, PresentationState } from '../plugins/types.js';
	import Scene from './Scene.svelte';

	interface Props {
		/** Ordered scenes to play. */
		sequence: Sequence;
		/** Plugins to register. */
		plugins?: Plugin[];
	}

	let { sequence, plugins = [] }: Props = $props();

	const manager = new SceneManager();
	setSceneManager(manager);

	const id = $derived(page.params.scene ?? sequence[0].id);

	setSceneId(() => id);

	const index = $derived(sequence.findIndex((s) => s.id === id));
	const scene = $derived(sequence.find((s) => s.id === id) ?? sequence[0]);
	const Content = $derived((await scene.component()).default);
	const progress = $derived(((index + manager.completion) / sequence.length) * 100);
	const showProgressBar = $derived(
		page.url.searchParams.get('render') !== 'video' || page.url.searchParams.get('progress') === '1'
	);

	// Reactive snapshot of the presentation, exposed to plugins via `ctx.state`.
	// The scene fields capture the initial values once; navigation and step
	// changes update the snapshot below.
	const state = $state<PresentationState>(
		untrack(() => ({
			sceneId: id,
			sceneIndex: index,
			totalScenes: sequence.length,
			step: manager.step,
			totalSteps: manager.totalSteps,
			finished: manager.finished
		}))
	);

	// Subscribed here (before the scene child mounts) so the first scene's
	// `manager.load` step change is captured.
	const syncStep = manager.onStepChange((step, total) => {
		state.step = step;
		state.totalSteps = total;
		state.finished = manager.finished;
	});

	const pluginManager = createPluginManager();

	onMount(() => {
		pluginManager.setup();
		return () => pluginManager.cleanup();
	});

	onDestroy(syncStep);

	afterNavigate(() => {
		state.sceneId = id;
		state.sceneIndex = index;
		pluginManager.emitSceneChange({ id, index });
	});

	if (typeof window !== 'undefined' && page.url.searchParams.get('render') === 'video') {
		setupRenderBridge();
	}

	function createPluginManager() {
		const pluginManager = new PluginManager(
			{ state, sequence, navigateTo, next, prev },
			manager.onStepChange.bind(manager)
		);
		for (const plugin of plugins) pluginManager.register(plugin);
		return pluginManager;
	}

	function setupRenderBridge() {
		const scheduler = manager.enableRenderMode();
		window.__sequenceRenderer = {
			manager,
			scheduler,
			scenes: sequence.map((s) => s.id),
			renderOptions: getOptions().render,
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

<svelte:window {onkeydown} />

<div class="flex h-dvh w-dvw items-center justify-center overflow-hidden bg-background">
	<Scene>
		<Content />
	</Scene>
</div>

{#if showProgressBar}
	<div class="fixed right-0 bottom-0 left-0 z-10 h-[4px] bg-surface">
		<div class="h-full bg-accent transition-all" style:width="{progress}%"></div>
	</div>
{/if}
