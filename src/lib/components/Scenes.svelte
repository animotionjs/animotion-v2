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

	/*
	 * Seed the current scene's position from the URL hash (`/scene#N`) before
	 * the scene child mounts and calls `manager.load`. No-op on the server,
	 * where the hash is never sent.
	 */
	untrack(() => applyUrlStep(id, page.url));

	const index = $derived(sequence.findIndex((s) => s.id === id));
	const scene = $derived(sequence.find((s) => s.id === id) ?? sequence[0]);

	/*
	 * Force every declared webfont to load before the scenes render, so the
	 * layout engine never measures glyphs at a fallback width and reflows
	 * text mid-animation when the real font swaps in.
	 */
	if (typeof document !== 'undefined') {
		await Promise.all([...document.fonts].map((font) => font.load()));
		await document.fonts.ready;
	}

	const Content = $derived((await scene.component()).default);
	const progress = $derived(((index + manager.completion) / sequence.length) * 100);
	const showProgressBar = $derived(
		!page.url.searchParams.has('render') || page.url.searchParams.has('progress')
	);

	/*
	 * Renders use the picked size rather than the deck config, so the video
	 * comes out full bleed instead of pillarboxed inside a square stage.
	 */
	const renderAspect = $derived.by(() => {
		if (!page.url.searchParams.has('render')) return undefined;
		const w = Number(page.url.searchParams.get('w'));
		const h = Number(page.url.searchParams.get('h'));
		return w > 0 && h > 0 ? w / h : undefined;
	});

	/*
	 * Reactive snapshot of the presentation, exposed to plugins via
	 * `ctx.state`. The scene fields capture the initial values once;
	 * navigation and step changes update the snapshot below.
	 */
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

	/*
	 * Subscribed here (before the scene child mounts) so the first scene's
	 * `manager.load` step change is captured.
	 */
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

	/*
	 * True while a scene-change navigation is in flight, so a second press at
	 * the boundary (which has no exit-transition window while the window is
	 * hidden) cannot start a second `goto` that would abort the first.
	 */
	let navigating = false;

	onMount(() => {
		pluginManager.setup();
		signalReady();
		return () => pluginManager.cleanup();
	});

	onDestroy(syncStep);

	afterNavigate(() => {
		state.sceneId = id;
		state.sceneIndex = index;
		pluginManager.emitSceneChange({ id, index });
		navigating = false;
	});

	// seed the target scene's position from its URL hash before it mounts
	beforeNavigate(({ to }) => {
		if (!to) return;
		applyUrlStep(to.params?.scene ?? sequence[0].id, to.url);
	});

	/*
	 * The renderer waits for this flag before taking any screenshot, so
	 * nothing ever captures a half-loaded image or video.
	 */
	let resolveReady: (() => void) | undefined;
	const ready = new Promise<void>((resolve) => (resolveReady = resolve));

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
			ready,
			navigateTo,
			advanceFrame: (delta: number) => manager.advanceFrame(delta)
		};
	}

	/** Raises the ready flag once media has settled and a couple of frames painted. */
	function signalReady() {
		const resolve = resolveReady;
		if (!resolve) return;
		void settleMedia().then(() => {
			// wait two frames so the browser has actually painted the result
			requestAnimationFrame(() => requestAnimationFrame(resolve));
		});
	}

	/**
	 * Waits until every image and video on the page has finished loading (or
	 * failed). Media created later by steps isn't covered, since mid-timeline
	 * slice prerolls already tolerate that.
	 */
	function settleMedia(): Promise<unknown> {
		return Promise.all(
			Array.from(document.querySelectorAll('img, video'), (el) => {
				if (el instanceof HTMLImageElement) return waitUntil(el.complete, el, ['load', 'error']);
				if (el instanceof HTMLVideoElement)
					return waitUntil(el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA, el, [
						'loadeddata',
						'error'
					]);
				return Promise.resolve();
			})
		);
	}

	/** Resolves immediately when `done`, else once one of `events` fires on `el`. */
	function waitUntil(done: boolean, el: Element, events: string[]): Promise<void> {
		if (done) return Promise.resolve();
		return new Promise((resolve) => {
			for (const event of events) el.addEventListener(event, () => resolve(), { once: true });
		});
	}

	function navigateTo(targetId: string) {
		const saved = manager.getSavedState(targetId);
		let step: number | null = null;
		if (saved) step = saved.stepCompleted ? saved.stepIndex + 1 : saved.stepIndex;
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

<!-- Every letter is drawn at its true size instead of snapped to the pixel
	grid. -->
<div
	class="flex h-dvh w-dvw items-center justify-center overflow-hidden bg-background"
	style:text-rendering="geometricprecision"
>
	<Scene ratio={renderAspect}>
		<Content />
	</Scene>
</div>

{#if showProgressBar}
	<div class="fixed right-0 bottom-0 left-0 z-10 h-[4px] bg-surface">
		<div class="h-full bg-accent transition-all" style:width="{progress}%"></div>
	</div>
{/if}
