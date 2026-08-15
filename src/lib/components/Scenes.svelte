<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { afterNavigate, beforeNavigate, goto, replaceState } from '$app/navigation';
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

	// Seed the current scene's position from the URL hash (`/scene#N`) before
	// the scene child mounts and calls `manager.load`. No-op on the server,
	// where the hash is never sent.
	untrack(() => applyUrlStep(id, page.url));

	const index = $derived(sequence.findIndex((s) => s.id === id));
	const scene = $derived(sequence.find((s) => s.id === id) ?? sequence[0]);

	// Force every declared webfont to load before the scenes render, so the
	// layout engine never measures glyphs at a fallback width and reflows text
	// mid-animation when the real font swaps in.
	if (typeof document !== 'undefined') {
		await Promise.all([...document.fonts].map((font) => font.load()));
		await document.fonts.ready;
	}

	const Content = $derived((await scene.component()).default);
	const progress = $derived(((index + manager.completion) / sequence.length) * 100);
	const showProgressBar = $derived(
		!page.url.searchParams.has('render') || page.url.searchParams.has('progress')
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
			stepCompleted: manager.stepCompleted,
			playing: manager.playing,
			finished: manager.finished
		}))
	);

	// Subscribed here (before the scene child mounts) so the first scene's
	// `manager.load` step change is captured.
	const syncStep = manager.onStepChange((step, total) => {
		state.step = step;
		state.totalSteps = total;
		state.stepCompleted = manager.stepCompleted;
		state.playing = manager.playing;
		state.finished = manager.finished;
		manager.saveState(id);
		updateUrlStep(step);
	});

	const pluginManager = createPluginManager();

	// True while a scene-change navigation is in flight, so a second press at
	// the boundary (which has no exit-transition window while the window is
	// hidden) cannot start a second `goto` that would abort the first.
	let navigating = false;

	onMount(() => {
		pluginManager.setup();
		return () => pluginManager.cleanup();
	});

	onDestroy(syncStep);

	afterNavigate(() => {
		state.sceneId = id;
		state.sceneIndex = index;
		pluginManager.emitSceneChange({ id, index });
		navigating = false;
	});

	// Seed the target scene's position from its URL hash before it mounts.
	beforeNavigate(({ to }) => {
		if (!to) return;
		applyUrlStep(to.params?.scene ?? sequence[0].id, to.url);
	});

	if (typeof window !== 'undefined' && page.url.searchParams.has('render')) {
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
		const saved = manager.getSavedState(targetId);
		const step = saved ? (saved.stepCompleted ? saved.stepIndex + 1 : saved.stepIndex) : null;
		const search = page.url.search;
		const hash = step === null || step === 0 ? '' : `#${step}`;
		return goto(`/${targetId}${search}${hash}`);
	}

	/**
	 * Restores the saved position for `sceneId` from `url`'s hash fragment
	 * (`/scene#N`). A valid non-negative integer becomes the paused step the
	 * scene resumes at; anything else leaves the scene at its start.
	 */
	function applyUrlStep(sceneId: string, url: { hash: string }) {
		const raw = url.hash.slice(1);
		if (raw === '') return;
		const step = Number(raw);
		if (Number.isInteger(step) && step >= 0) {
			manager.restoreState(sceneId, step);
		}
	}

	/** Mirrors the current step in the URL hash (`/scene#N`) without navigating. */
	function updateUrlStep(step: number) {
		if (typeof window === 'undefined') return;
		if (page.url.searchParams.has('render')) return;
		const location = window.location;
		if (step === 0) {
			if (!location.hash) return;
			replaceState(location.pathname + location.search, {});
			return;
		}
		if (location.hash === `#${step}`) return;
		replaceState(`#${step}`, {});
	}

	function next() {
		if (manager.exitBusy || navigating) return;
		if (manager.finished) {
			if (index >= sequence.length - 1) return;
			navigating = true;
			manager.saveState(id);
			manager.setDirection('forward');
			manager.playExit().then(() => navigateTo(sequence[index + 1].id));
		} else {
			manager.next();
		}
	}

	function prev() {
		if (manager.exitBusy || navigating) return;
		if (manager.atStart) {
			if (index <= 0) return;
			navigating = true;
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
