<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SceneManager, type Direction } from '../scene/runtime/runtime.svelte.js';
	import { AudioController } from '../scene/audio/controller.js';
	import { getOptions } from '../scene/index.js';
	import { PluginManager, type StepChangeSubscribe } from '../plugins/manager.svelte.js';
	import SceneStage from './SceneStage.svelte';
	import type { RenderScheduler } from '../scene/runtime/scheduler.js';
	import type { SceneEntry, Sequence } from '../scene/runtime/sequence.js';
	import type { Plugin, PresentationState } from '../plugins/types.js';

	interface Props {
		/** Ordered scenes to play. */
		sequence: Sequence;
		/** Plugins to register. */
		plugins?: Plugin[];
		/** Presentation URL for this project. */
		base?: string;
	}

	let { sequence, plugins = [], base = '/presentation' }: Props = $props();

	/*
	 * Every mounted scene owns its manager, so a scene on its way out keeps
	 * its transition and its step position while the next scene enters.
	 */
	type Stage = {
		id: string;
		entry: SceneEntry;
		manager: SceneManager;
		/** The stage's render scheduler while the page renders, else null. */
		scheduler: RenderScheduler | null;
		/** Whether the stage is playing its exit and must stay mounted. */
		leaving: boolean;
	};

	/** Where each scene stopped, so returning to one resumes there. */
	const savedStates = new SvelteMap<string, { stepIndex: number; stepCompleted: boolean }>();

	const isRenderMode = page.url.searchParams.has('render');
	const audioDisabled = isRenderMode || page.url.searchParams.has('embed');

	const id = $derived(page.params.scene ?? sequence[0]!.id);

	/*
	 * Seed the current scene's position from the URL hash
	 * (`/presentation/scene#N`) before its stage mounts. No-op on the server,
	 * where the hash is never sent.
	 */
	untrack(() => applyUrlStep(id, page.url));

	/*
	 * A rendered scene that follows another one mounts it as a guest, so the
	 * overlap the renderer photographs matches what the player shows. A
	 * standalone scene render has no guest and keeps its clip to itself.
	 */
	const previousId = isRenderMode ? page.url.searchParams.get('previous') : null;
	const guest = previousId ? createStage(previousId, false) : null;
	guest?.manager.suppressEnter();

	/*
	 * The opening stage is built once from the route it lands on. Later
	 * scenes are stages added by `go`, never by re-deriving this list.
	 */
	const opening = untrack(() => createStage(id, isRenderMode));
	let stages = $state<Stage[]>(guest ? [guest, opening] : [opening]);

	const active = $derived(stages.at(-1)!);
	const manager = $derived(active.manager);
	const activeIndex = $derived(indexOf(active.id));

	await loadFonts();

	const progress = $derived(((activeIndex + manager.completion) / sequence.length) * 100);
	const showProgressBar = $derived(
		!page.url.searchParams.has('render') || page.url.searchParams.has('progress')
	);

	/*
	 * Renders use the picked size rather than the presentation config, so the video
	 * comes out full bleed instead of pillarboxed inside a square stage.
	 */
	const renderAspect = $derived.by(() => {
		if (!page.url.searchParams.has('render')) return undefined;
		const w = Number(page.url.searchParams.get('w'));
		const h = Number(page.url.searchParams.get('h'));
		return w > 0 && h > 0 ? w / h : undefined;
	});

	let audio: AudioController | null = null;
	let audioPlaying = false;
	let audioUnlocked = false;
	let audioSuppressed = false;

	/*
	 * Reactive snapshot of the presentation, exposed to plugins via
	 * `ctx.state`. The scene fields capture the initial values once, and
	 * navigation and step changes update the snapshot below.
	 */
	const presentationState = $state<PresentationState>(
		untrack(() => ({
			sceneId: active.id,
			sceneIndex: indexOf(active.id),
			totalScenes: sequence.length,
			step: manager.step,
			totalSteps: manager.totalSteps,
			stepCompleted: manager.stepCompleted,
			playing: manager.playing,
			finished: manager.finished
		}))
	);

	/** Step changes, fanned out to whoever subscribes rather than one manager. */
	const stepListeners = new SvelteSet<(step: number, total: number) => void>();
	const subscribeStepChange: StepChangeSubscribe = (listener) => {
		stepListeners.add(listener);
		return () => stepListeners.delete(listener);
	};

	const pluginManager = createPluginManager();

	/*
	 * The active stage is the only one that drives the presentation, so its
	 * subscriptions move here when a new scene takes over.
	 */
	let unsubscribers: Array<() => void> = [];

	function attachStage(stage: Stage) {
		const stageManager = stage.manager;
		unsubscribers.push(
			stageManager.onStepChange((step, total) => {
				presentationState.step = step;
				presentationState.totalSteps = total;
				presentationState.stepCompleted = stageManager.stepCompleted;
				presentationState.playing = stageManager.playing;
				presentationState.finished = stageManager.finished;
				/*
				 * A scene reports its first step as it loads, which is the
				 * first moment its position is known. Announcing the change
				 * here keeps the snapshot from pairing a new scene with the
				 * outgoing scene's steps, which a mirror would then adopt as
				 * its own position and seek to correct.
				 */
				if (stage.id !== presentationState.sceneId) announceScene(stage);
				savedStates.set(stage.id, {
					stepIndex: stageManager.step,
					stepCompleted: stageManager.stepCompleted
				});
				updateUrlStep(step);
				for (const listener of stepListeners) listener(step, total);
			}),
			stageManager.onLoad(() => {
				if (!audioDisabled) loadAudio(stage);
			}),
			stageManager.onPlaybackChange((time, playing) => {
				if (!audioDisabled) syncAudio(time, playing);
			})
		);
	}

	function detachStage() {
		for (const unsubscribe of unsubscribers) unsubscribe();
		unsubscribers = [];
	}

	/**
	 * Announces the stage that has taken over, once its step fields are in
	 * place. The scene change waits for the new scene to load because only
	 * then is its step position known, and a snapshot that mixed the new
	 * scene with the outgoing scene's steps would send a mirror to the wrong
	 * step.
	 */
	function announceScene(stage: Stage) {
		const index = indexOf(stage.id);
		presentationState.sceneId = stage.id;
		presentationState.sceneIndex = index;
		pluginManager.emitSceneChange({ id: stage.id, index });
	}

	untrack(() => attachStage(active));

	/*
	 * True while a scene change is in flight, so a second press at the
	 * boundary cannot start a second handoff.
	 */
	let navigating = false;

	/*
	 * Waits a frame before the bar can animate so a scene restoring its step
	 * from the url hash sets the width instantly instead of sliding there.
	 */
	let animated = $state(false);

	onMount(() => {
		if (!audioDisabled) {
			audio = new AudioController();
			loadAudio(active);
		}
		// slash alone shows the first scene without its name, so use the named url instead
		const redirected = useNamedUrl();
		/*
		 * Plugins set up on every mount, even when redirecting. The redirect
		 * is a same-route replace, so this mount is the only one. Skipping
		 * setup here would leave every plugin silently dead.
		 */
		pluginManager.setup();
		if (redirected) return () => pluginManager.cleanup();
		// child scenes mount first, so their load already corrected the bar
		requestAnimationFrame(() => (animated = true));
		void signalReady();
		return () => pluginManager.cleanup();
	});

	onDestroy(() => {
		detachStage();
		const controller = audio;
		audio = null;
		controller?.destroy();
		audioPlaying = false;
	});

	/*
	 * A route change that arrives while a handoff is running, such as a back
	 * press mid-transition, is remembered and applied once it ends so the
	 * stages and the url never drift apart.
	 */
	let pendingRoute: string | null = null;

	/*
	 * A plugin navigation that arrives during a handoff is remembered too,
	 * so a follower that was told to leave a scene never stays on it just
	 * because its own handoff had not finished.
	 */
	let pendingNavigate: string | null = null;

	afterNavigate((navigation) => {
		// shallow navigations only mirror the step in the url hash
		if (navigation.shallow) return;
		audioSuppressed = false;
		if (manager.isAnimating) syncAudio(manager.liveTime, true);
		// going back can land on slash which shows the first scene without its name, so use the named url instead
		if (useNamedUrl()) return;
		if (navigating) {
			pendingRoute = id;
			return;
		}
		reconcileRoute();
	});

	/** Moves to the route's scene when the route moved on its own. */
	function reconcileRoute() {
		const current = stages.at(-1);
		if (!current || current.id === id) return;
		pendingRoute = null;
		void go(id, indexOf(id) < indexOf(current.id) ? 'backward' : 'forward');
	}

	// seed the target scene's position from its URL hash before it mounts
	beforeNavigate((navigation) => {
		if (navigation.shallow || !navigation.to) return;
		audioSuppressed = true;
		stopAudio();
		applyUrlStep(navigation.to.params?.scene ?? sequence[0]!.id, navigation.to.url);
	});

	/*
	 * The renderer waits for this flag before taking any screenshot, so
	 * nothing ever captures a half-loaded image or video.
	 */
	let resolveReady: (() => void) | undefined;
	const ready = new Promise<void>((resolve) => (resolveReady = resolve));

	if (typeof window !== 'undefined' && isRenderMode) {
		setupRenderBridge();
	}

	function createPluginManager() {
		const pluginManager = new PluginManager(
			{
				state: presentationState,
				sequence,
				get manager() {
					return active.manager;
				},
				navigateTo,
				next,
				prev
			},
			subscribeStepChange
		);
		for (const plugin of plugins) pluginManager.register(plugin);
		return pluginManager;
	}

	function setupRenderBridge() {
		window.__sequenceRenderer = {
			get manager() {
				return active.manager;
			},
			get scheduler() {
				return active.scheduler!;
			},
			scenes: sequence.map((scene) => scene.id),
			get tracks() {
				return active.manager.tracks;
			},
			renderOptions: getOptions().render,
			ready,
			navigateTo,
			/*
			 * Every mounted stage advances on the same tick, so the guest
			 * keeps leaving while the scene on screen plays its own steps.
			 * Only the active scene decides when a phase is over.
			 */
			advanceFrame: (delta: number) => {
				const current = stages.at(-1)!;
				let result = { done: true };
				for (const stage of stages) {
					const frame = stage.manager.advanceFrame(delta);
					if (stage === current) result = frame;
				}
				return result;
			}
		};
	}

	/**
	 * Forces every declared webfont to load before the scenes render, so the
	 * layout engine never measures glyphs at a fallback width and reflows
	 * text mid-animation when the real font swaps in.
	 */
	async function loadFonts() {
		if (typeof document === 'undefined') return;
		await Promise.all([...document.fonts].map((font) => font.load()));
		await document.fonts.ready;
	}

	/** Builds a stage and seeds the position its scene resumes at. */
	function createStage(sceneId: string, enter: boolean, direction: Direction = 'forward'): Stage {
		const entry = sequence.find((scene) => scene.id === sceneId) ?? sequence[0]!;
		const manager = new SceneManager();
		manager.setDirection(direction);
		const scheduler = isRenderMode ? manager.enableRenderMode() : null;
		if (enter) manager.expectEnter();
		const saved = savedStates.get(entry.id);
		if (saved) manager.setStepState(entry.id, saved.stepIndex, saved.stepCompleted);
		return { id: entry.id, entry, manager, scheduler, leaving: false };
	}

	/**
	 * Moves to `targetId` with both scenes animating at once. The target
	 * module is imported first so the leaving exit and the entering enter
	 * start on the same frame instead of the enter lagging behind a load.
	 */
	async function go(targetId: string, direction: Direction) {
		const current = stages.at(-1);
		if (!current || current.id === targetId) return;
		if (navigating || current.leaving) return;
		const entry = sequence.find((scene) => scene.id === targetId);
		if (!entry) return;

		navigating = true;
		audioSuppressed = true;
		stopAudio();
		savedStates.set(current.id, {
			stepIndex: current.manager.step,
			stepCompleted: current.manager.stepCompleted
		});

		try {
			await entry.component();
		} catch (error) {
			// a scene that never loads must not leave navigation stuck
			navigating = false;
			throw error;
		}

		current.manager.setDirection(direction);
		current.leaving = true;
		const exit = current.manager.playExit();

		const stage = createStage(entry.id, true, direction);
		stages = [...stages, stage];
		detachStage();
		attachStage(stage);
		/*
		 * The scene change is announced when the new scene reports its
		 * position. A scene that fails to load reports nothing, so the
		 * previous snapshot stays instead of one made up here.
		 */
		void updateUrl(stage.id);

		await exit;
		removeStage(current.id);
		navigating = false;
		if (pendingRoute !== null) {
			pendingRoute = null;
			reconcileRoute();
		}
		// a plugin navigation queued during the handoff is applied once it ends
		if (pendingNavigate !== null && !navigating) {
			const target = pendingNavigate;
			pendingNavigate = null;
			if (stages.at(-1)?.id !== target) void navigateTo(target);
		}
	}

	/** Unmounts a stage, keeping the active scene on screen. */
	function removeStage(stageId: string) {
		stages = stages.filter((stage) => stage.id !== stageId);
	}

	function indexOf(sceneId: string) {
		return sequence.findIndex((scene) => scene.id === sceneId);
	}

	function loadAudio(stage: Stage) {
		const controller = audio;
		if (!controller) return;
		controller.stop();
		controller.load(stage.manager.tracks, stage.manager.timeline.totalDuration);
		audioPlaying = false;
	}

	function syncAudio(time: number, playing: boolean) {
		const controller = audio;
		if (!controller) return;
		if (audioSuppressed) {
			controller.pause();
			audioPlaying = false;
			return;
		}
		if (controller.currentTime >= controller.duration) {
			controller.pause();
			audioPlaying = false;
			return;
		}
		if (!playing) {
			if (audioPlaying) syncLiveAudio(controller, time);
			else {
				controller.pause();
				audioPlaying = false;
			}
			return;
		}
		if (audioPlaying) syncLiveAudio(controller, time);
		else void controller.play(time);
		audioPlaying = true;
	}

	function syncLiveAudio(controller: AudioController, time: number) {
		const currentTime = controller.currentTime;
		if (time !== currentTime) controller.sync(time, true);
	}

	function stopAudio() {
		audio?.stop();
		audioPlaying = false;
	}

	function unlockAudio() {
		const controller = audio;
		if (!controller) return;
		if (audioUnlocked) {
			if (manager.isAnimating) syncAudio(manager.liveTime, true);
			return;
		}
		audioUnlocked = true;
		try {
			Promise.resolve(controller.unlock())
				.then((unlocked) => {
					if (audio !== controller) return;
					if (unlocked === false) {
						audioUnlocked = false;
						return;
					}
					if (manager.isAnimating) syncAudio(manager.liveTime, true);
				})
				.catch(() => {
					if (audio === controller) audioUnlocked = false;
				});
		} catch {
			audioUnlocked = false;
		}
	}

	/**
	 * Raises the ready flag once every mounted scene has loaded and media has
	 * settled. A guest scene is primed to its finished frame here and starts
	 * leaving at the same moment as the scene on screen enters.
	 */
	async function signalReady() {
		const resolve = resolveReady;
		if (!resolve) return;
		await Promise.all(stages.map((stage) => stage.manager.whenLoaded()));
		if (guest) {
			// the guest shows its finished frame, then leaves as the scene enters
			guest.manager.seek(0, false, true);
			void guest.manager.playExit().then(() => removeStage(guest.id));
		}
		await settleMedia();
		// wait two frames so the browser has actually painted the result
		requestAnimationFrame(() => requestAnimationFrame(resolve));
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

	function useNamedUrl() {
		if (page.params.scene || !sequence[0]) return false;
		const search = page.url.search;
		const hash = page.url.hash;
		goto(`${base}/${sequence[0].id}${search}${hash}`, { replace: true });
		return true;
	}

	/**
	 * Restores the saved position for `sceneId` from `url`'s hash fragment
	 * (`/presentation/scene#N`). A valid non-negative integer becomes the
	 * paused step the scene resumes at, and anything else leaves the scene at its
	 * start.
	 */
	function applyUrlStep(sceneId: string, url: { hash: string }) {
		const raw = url.hash.slice(1);
		if (raw === '') return;
		const step = Number(raw);
		if (Number.isInteger(step) && step >= 0) {
			savedStates.set(sceneId, { stepIndex: step, stepCompleted: false });
		}
	}

	/** Mirrors the current step in the URL hash (`/presentation/scene#N`) without navigating. */
	function updateUrlStep(step: number) {
		if (typeof window === 'undefined') return;
		if (page.url.searchParams.has('render')) return;
		const location = window.location;
		if (step === 0) {
			if (!location.hash) return;
			goto(`${location.pathname}${location.search}`, { shallow: true, state: {} });
			return;
		}
		if (location.hash === `#${step}`) return;
		goto(`${location.pathname}${location.search}#${step}`, { shallow: true, state: {} });
	}

	/** Writes `targetId` into the URL, resuming it at the step it stopped on. */
	function updateUrl(targetId: string) {
		const saved = savedStates.get(targetId);
		let step: number | null = null;
		if (saved) step = saved.stepCompleted ? saved.stepIndex + 1 : saved.stepIndex;
		const search = page.url.search;
		const hash = step === null || step === 0 ? '' : `#${step}`;
		return goto(`${base}/${targetId}${search}${hash}`);
	}

	/**
	 * Moves to `targetId`, picking the direction from the scene order. A
	 * `step` seeds where the target scene resumes, for callers that track a
	 * position the scene has not reached yet.
	 */
	function navigateTo(targetId: string, step?: { index: number; completed: boolean }) {
		const to = indexOf(targetId);
		/*
		 * A scene that is not in the sequence is dropped by `go` anyway, and
		 * must not displace a request that is already waiting.
		 */
		if (to === -1) return Promise.resolve();
		if (step) savedStates.set(targetId, { stepIndex: step.index, stepCompleted: step.completed });
		const current = stages.at(-1);
		if (!current) return Promise.resolve();
		/*
		 * A handoff that is already running cannot start another one, so the
		 * request waits for it to end. A follower that asked once never asks
		 * again for the same scene, so dropping the request would strand it.
		 */
		if (navigating) {
			if (current.id !== targetId) pendingNavigate = targetId;
			return Promise.resolve();
		}
		const from = indexOf(current.id);
		return go(targetId, to < from ? 'backward' : 'forward');
	}

	function next() {
		if (navigating || active.leaving) return;
		if (manager.finished) {
			if (activeIndex >= sequence.length - 1) return;
			void go(sequence[activeIndex + 1]!.id, 'forward');
		} else {
			manager.next();
		}
	}

	function prev() {
		if (navigating || active.leaving) return;
		if (manager.atStart) {
			if (activeIndex <= 0) return;
			void go(sequence[activeIndex - 1]!.id, 'backward');
		} else {
			stopAudio();
			manager.prev();
		}
	}

	function onkeydown(e: KeyboardEvent) {
		unlockAudio();
		if (pluginManager.handleKeydown(e)) return;
		if (e.key === 'ArrowRight') next();
		if (e.key === 'ArrowLeft') prev();
	}
</script>

<svelte:window {onkeydown} onpointerdown={unlockAudio} onclick={unlockAudio} />

<!-- Every letter is drawn at its true size instead of snapped to the pixel
	grid. Stages stack, with the scene on screen painted over a leaving one. -->
<div
	class="relative flex h-dvh w-dvw items-center justify-center overflow-hidden bg-background"
	style:text-rendering="geometricprecision"
>
	{#each stages as stage, index (stage.id)}
		<SceneStage
			entry={stage.entry}
			manager={stage.manager}
			ratio={renderAspect}
			active={index === stages.length - 1}
		/>
	{/each}
</div>

{#if showProgressBar}
	<div class="fixed right-0 bottom-0 left-0 z-10 h-[4px] bg-surface">
		<div class="h-full bg-accent" class:transition-all={animated} style:width="{progress}%"></div>
	</div>
{/if}
