<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { AudioPlayer } from '../canvas/audio.js';
	import { loadCanvasFonts } from '../canvas/fonts.js';
	import { CanvasRenderer } from '../canvas/renderer.js';
	import { nextStep, previousStep, stepSpans } from '../canvas/navigation.js';
	import {
		enterTransition,
		exitTransition,
		resolveTransition,
		type ResolvedTransition
	} from '../canvas/transition.js';
	import { PluginManager } from '../plugins/manager.svelte.js';
	import { getOptions } from '../scene/options.js';
	import type { AudioTrack } from '../scene/audio/tracks.js';
	import type { ProjectDefinition } from '../canvas/project.js';
	import type { SceneInstance } from '../canvas/scene.js';
	import type { Plugin, PresentationManager, PresentationState } from '../plugins/types.js';
	import type { SceneEntry } from '../scene/runtime/sequence.js';

	interface Props {
		project: ProjectDefinition;
		/** Scene to open on, from the route. */
		sceneId?: string;
		/** Presentation URL for this project, used to keep the address bar current. */
		base?: string;
		/** Presentation plugins. */
		plugins?: Plugin[];
	}

	let { project, sceneId, base = '/presentation', plugins = [] }: Props = $props();

	let canvas: HTMLCanvasElement | undefined;
	let renderer: CanvasRenderer | null = null;
	let audio: AudioPlayer | null = null;

	const initial = untrack(() => ({ project, sceneId, plugins }));
	const scenes = initial.project.scenes;
	const width = initial.project.size.width;
	const height = initial.project.size.height;

	const query = untrack(() =>
		typeof window === 'undefined'
			? new URLSearchParams()
			: new URLSearchParams(window.location.search)
	);
	const isRender = query.has('render');
	const audioDisabled = isRender || query.has('embed');
	const previousId = isRender ? query.get('previous') : null;
	let showProgress = $state(!isRender);

	const requested = initial.sceneId ? scenes.findIndex((entry) => entry.id === initial.sceneId) : 0;
	let sceneIndex = $state(requested >= 0 ? requested : 0);
	let scene = $state<SceneInstance>(untrack(() => scenes[sceneIndex]!.create()));
	let time = $state(0);
	let playing = $state(false);

	let outgoing = $state<SceneInstance | null>(null);
	let outgoingTime = 0;
	let direction: 'forward' | 'backward' = 'forward';
	let activeTransition: ResolvedTransition | null = untrack(() =>
		resolveTransition(scenes[sceneIndex]!.transition)
	);
	let transitionProgress = $state(
		isRender && activeTransition && activeTransition.duration > 0 ? 0 : 1
	);

	/** Render mode advances the enter transition and each step on demand. */
	let renderEnter = isRender && activeTransition !== null && activeTransition.duration > 0;
	let renderEnd: number | null = null;
	let renderExit = -1;

	if (isRender && previousId) {
		const previous = untrack(() => {
			const definition = scenes.find((entry) => entry.id === previousId);
			if (!definition) return null;
			const instance = definition.create();
			instance.seek(instance.duration);
			return instance;
		});
		if (previous) {
			outgoing = previous;
			outgoingTime = previous.duration;
		}
	}

	let resolveReady: () => void = () => {};
	const ready = new Promise<void>((resolve) => (resolveReady = resolve));

	/** Where each scene stopped, so returning to it resumes on the same frame. */
	const savedTimes = new SvelteMap<string, number>();

	let frame = 0;
	let transitionFrame = 0;
	let last = 0;
	let transitionStart = 0;
	let stopAt: number | null = null;
	let lastStep = -1;

	const duration = $derived(scene.duration);
	const progress = $derived(
		((sceneIndex + (duration > 0 ? time / duration : 1)) / scenes.length) * 100
	);
	const transitioning = $derived(outgoing !== null && transitionProgress < 1);

	const sequence: SceneEntry[] = scenes.map((definition, order) => ({
		id: definition.id,
		order,
		definition,
		chapter: definition.chapter,
		notes: definition.notes,
		width,
		height,
		background: initial.project.background
	}));

	const start = untrack(() => ({
		sceneId: scenes[sceneIndex]!.id,
		sceneIndex,
		totalSteps: scene.timeline.steps.length
	}));

	const presentation = $state<PresentationState>({
		sceneId: start.sceneId,
		sceneIndex: start.sceneIndex,
		totalScenes: scenes.length,
		step: 0,
		totalSteps: start.totalSteps,
		stepCompleted: false,
		playing: false,
		finished: false
	});

	/** Drives the presenter from the speaker window. */
	const manager: PresentationManager = {
		seek(step, completed = false, finished = false) {
			const ends = stepEnds();
			let target = 0;
			if (finished) target = duration;
			else if (completed) target = ends[step] ?? duration;
			else if (step > 0) target = ends[step - 1] ?? 0;
			seek(target);
		},
		play() {
			play();
		}
	};

	function navigateTo(id: string) {
		const index = scenes.findIndex((definition) => definition.id === id);
		if (index !== -1 && index !== sceneIndex) {
			switchScene(index, index < sceneIndex ? 'backward' : 'forward');
		}
		return Promise.resolve();
	}

	const pluginManager = new PluginManager(
		{
			state: presentation,
			sequence,
			manager,
			navigateTo,
			next: () => next(),
			prev: () => prev()
		},
		() => () => {}
	);
	for (const plugin of initial.plugins) pluginManager.register(plugin);

	onMount(() => {
		const updateViewport = () => {
			renderer?.resize();
			draw();
		};
		window.addEventListener('resize', updateViewport);
		return () => window.removeEventListener('resize', updateViewport);
	});

	onMount(() => {
		pluginManager.setup();
		pluginManager.emitSceneChange({ id: scenes[sceneIndex]!.id, index: sceneIndex });
		updateUrl();
		if (isRender) {
			showProgress = new URLSearchParams(window.location.search).has('progress');
		}

		if (!canvas) return;
		let cancelled = false;

		void loadCanvasFonts().then(() => {
			if (cancelled || !canvas) return;
			renderer = new CanvasRenderer(canvas, scene, {
				width,
				height,
				background: initial.project.background
			});
			scene.setInvalidate(draw);
			if (!audioDisabled) {
				audio = new AudioPlayer();
				audio.load(scene.audio);
			}
			draw();
			if (isRender) {
				setupRenderBridge();
				requestAnimationFrame(() => requestAnimationFrame(resolveReady));
			}
		});

		return () => {
			cancelled = true;
			teardownRenderBridge();
			scene.setInvalidate(null);
			outgoing?.setInvalidate(null);
			renderer = null;
			audio?.stop();
			audio = null;
			cancelAnimationFrame(frame);
			cancelAnimationFrame(transitionFrame);
			pluginManager.cleanup();
		};
	});

	onDestroy(() => {
		cancelAnimationFrame(frame);
		cancelAnimationFrame(transitionFrame);
	});

	/** Keeps the address bar in step with the scene on screen. */
	function updateUrl() {
		if (isRender || typeof window === 'undefined') return;
		const path = `${base}/${scenes[sceneIndex]!.id}`;
		if (window.location.pathname === path) return;
		void goto(`${path}${window.location.search}`, { replace: true });
	}

	function draw() {
		const current = renderer;
		if (!current) return;

		current.begin();
		if (renderExit >= 0) {
			current.drawScene(
				scene,
				duration,
				exitTransition(activeTransition, renderExit, width, direction),
				{ playing: false }
			);
		} else if (transitionProgress < 1) {
			if (outgoing) {
				current.drawScene(
					outgoing,
					outgoingTime,
					exitTransition(activeTransition, transitionProgress, width, direction),
					{ playing: false }
				);
			}
			current.drawScene(
				scene,
				time,
				enterTransition(activeTransition, transitionProgress, width, direction),
				{ playing: false }
			);
		} else {
			current.drawScene(scene, time, undefined, { playing: playing && !isRender });
		}
		current.end();
		audio?.sync(time, playing);
		syncState();
	}

	function syncState(force = false) {
		const steps = scene.timeline.steps;
		const ends = stepEnds();
		let step = 0;
		for (const end of ends) {
			if (time + 1e-6 >= end) step += 1;
			else break;
		}
		const completed = step < steps.length && time + 1e-6 >= (ends[step] ?? 0);

		presentation.sceneId = scenes[sceneIndex]!.id;
		presentation.sceneIndex = sceneIndex;
		presentation.totalScenes = scenes.length;
		presentation.step = step;
		presentation.totalSteps = steps.length;
		presentation.stepCompleted = completed;
		presentation.playing = playing;
		presentation.finished = time + 1e-6 >= duration;

		if (force || step !== lastStep) {
			lastStep = step;
			pluginManager.emitStepChange(step, steps.length);
		}
	}

	function stepEnds(): number[] {
		let cursor = 0;
		return scene.timeline.steps.map((step) => {
			cursor += step.duration;
			return cursor;
		});
	}

	function renderFinished() {
		if (renderEnter || renderExit >= 0 || renderEnd !== null) return false;
		return time >= duration - 1e-9;
	}

	/** Advances one render frame through the enter, a step, or the exit. */
	function advanceRenderFrame(delta: number) {
		const duration = activeTransition?.duration ?? 0;
		if (renderExit >= 0) {
			renderExit = duration > 0 ? Math.min(1, renderExit + delta / duration) : 1;
			draw();
			return { done: renderExit >= 1 };
		}

		if (renderEnter) {
			transitionProgress = duration > 0 ? Math.min(1, transitionProgress + delta / duration) : 1;
			if (transitionProgress >= 1) {
				transitionProgress = 1;
				outgoing?.setInvalidate(null);
				outgoing = null;
				renderEnter = false;
			}
			draw();
			return { done: !renderEnter };
		}

		if (renderEnd !== null) {
			time = Math.min(renderEnd, time + delta);
			const done = time >= renderEnd - 1e-9;
			if (done) renderEnd = null;
			draw();
			return { done };
		}

		return { done: true };
	}

	function nextRenderStep() {
		if (renderFinished()) return;
		const target = stepEnds().find((end) => end > time + 1e-4);
		if (target === undefined) {
			time = duration;
			renderEnd = null;
		} else {
			renderEnd = target;
		}
		draw();
	}

	function playRenderExit() {
		renderExit = activeTransition && activeTransition.duration > 0 ? 0 : 1;
		draw();
	}

	function renderTracks(): AudioTrack[] {
		return scene.audio.map((cue) => ({
			src: cue.src,
			at: cue.at,
			volume: cue.volume,
			rate: 1,
			loop: cue.loop,
			trimStart: 0,
			duration: cue.duration,
			fadeIn: 0,
			fadeOut: 0
		}));
	}

	/** Exposes the protocol the CLI renderer already drives. */
	function setupRenderBridge() {
		const bridge = {
			manager: {
				loaded: true,
				get finished() {
					return renderFinished();
				},
				get totalSteps() {
					return scene.timeline.steps.length;
				},
				get phase() {
					if (renderFinished()) return 'finished';
					if (renderEnter || renderExit >= 0 || renderEnd !== null) return 'tweening';
					return 'paused';
				},
				get transitionActive() {
					return renderEnter || renderExit >= 0;
				},
				next: nextRenderStep,
				playExit: playRenderExit,
				setDirection(next: 'forward' | 'backward') {
					direction = next;
				}
			},
			scheduler: {
				now: () => performance.now(),
				request: (callback: FrameRequestCallback) => requestAnimationFrame(callback),
				cancel: (id: number) => cancelAnimationFrame(id)
			},
			scenes: scenes.map((definition) => definition.id),
			get tracks() {
				return renderTracks();
			},
			renderOptions: getOptions().render,
			ready,
			navigateTo: () => Promise.resolve(),
			advanceFrame: advanceRenderFrame
		};

		(window as unknown as { __sequenceRenderer?: typeof bridge }).__sequenceRenderer = bridge;
	}

	function teardownRenderBridge() {
		const target = window as unknown as { __sequenceRenderer?: unknown };
		if (isRender && target.__sequenceRenderer) delete target.__sequenceRenderer;
	}

	function seek(next: number) {
		pause();
		time = Math.min(duration, Math.max(0, next));
		draw();
	}

	function next() {
		// a press during a scene transition finishes the transition first
		if (transitioning) {
			finishTransition();
			return;
		}
		pause();
		const target = nextStep(stepSpans(scene.timeline.steps), time);
		if (target) {
			// holds are skipped, so an arrow press always reaches a visible change
			if (target.start > time + 1e-4) seek(target.start);
			playTo(target.end);
			return;
		}
		if (sceneIndex < scenes.length - 1) {
			switchScene(sceneIndex + 1, 'forward');
			return;
		}
		// the last scene can end on a hold, so finish it instead of stalling short of 100%
		if (time < duration - 1e-4) seek(duration);
	}

	function prev() {
		if (transitioning) {
			finishTransition();
			return;
		}
		pause();
		const target = previousStep(stepSpans(scene.timeline.steps), time);
		if (target) {
			seek(target.start);
			return;
		}
		if (sceneIndex > 0) switchScene(sceneIndex - 1, 'backward');
	}

	function switchScene(index: number, move: 'forward' | 'backward') {
		if (transitioning) return;
		if (index < 0 || index >= scenes.length || index === sceneIndex) return;
		pause();

		savedTimes.set(scenes[sceneIndex]!.id, time);
		outgoing = scene;
		outgoingTime = time;
		direction = move;
		sceneIndex = index;
		lastStep = -1;

		const definition = scenes[index]!;
		activeTransition = resolveTransition(definition.transition);
		const nextScene = definition.create();
		const saved = savedTimes.get(definition.id);
		let nextTime = 0;
		if (saved !== undefined) nextTime = Math.min(nextScene.duration, saved);
		else if (move === 'backward') nextTime = nextScene.duration;
		nextScene.seek(nextTime);

		scene = nextScene;
		time = nextTime;
		if (!audioDisabled) audio?.load(nextScene.audio);
		nextScene.setInvalidate(draw);
		if (activeTransition && activeTransition.duration > 0) {
			transitionProgress = 0;
			transitionStart = performance.now();
			cancelAnimationFrame(transitionFrame);
			transitionFrame = requestAnimationFrame(tickTransition);
		} else {
			transitionProgress = 1;
			outgoing?.setInvalidate(null);
			outgoing = null;
		}
		draw();
		pluginManager.emitSceneChange({ id: definition.id, index });
		updateUrl();
	}

	function tickTransition(now: number) {
		const duration = (activeTransition?.duration ?? 0) * 1000;
		if (duration <= 0) {
			finishTransition();
			return;
		}
		const nextProgress = Math.min(1, (now - transitionStart) / duration);
		transitionProgress = nextProgress;
		if (nextProgress >= 1) {
			outgoing?.setInvalidate(null);
			outgoing = null;
		}
		draw();
		if (nextProgress >= 1) return;
		transitionFrame = requestAnimationFrame(tickTransition);
	}

	function finishTransition() {
		if (!outgoing) return;
		cancelAnimationFrame(transitionFrame);
		transitionProgress = 1;
		outgoing.setInvalidate(null);
		outgoing = null;
		draw();
	}

	function play() {
		if (transitioning) finishTransition();
		if (playing || duration <= 0) return;
		if (time >= duration) seek(0);
		stopAt = null;
		playing = true;
		last = performance.now();
		audio?.sync(time, true);
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(tick);
	}

	function playTo(target: number) {
		if (transitioning) finishTransition();
		if (target <= time) return;
		stopAt = target;
		playing = true;
		last = performance.now();
		audio?.sync(time, true);
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(tick);
	}

	function tick(now: number) {
		if (!playing) return;
		const delta = Math.min((now - last) / 1000, 0.1);
		last = now;
		const limit = stopAt ?? duration;
		const nextTime = time + delta;

		if (nextTime >= limit) {
			time = limit;
			playing = false;
			stopAt = null;
			draw();
			return;
		}

		time = nextTime;
		draw();
		frame = requestAnimationFrame(tick);
	}

	function pause() {
		playing = false;
		stopAt = null;
		cancelAnimationFrame(frame);
		audio?.sync(time, false);
		syncState();
	}

	/** Space pauses a running scene and starts a stopped one. */
	function playPause() {
		if (playing) pause();
		else play();
	}

	function onkeydown(event: KeyboardEvent) {
		if (pluginManager.handleKeydown(event)) return;
		if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			next();
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			prev();
		} else if (event.key === ' ') {
			event.preventDefault();
			playPause();
		} else if (event.key === 'f') {
			event.preventDefault();
			if (document.fullscreenElement) document.exitFullscreen();
			else void document.documentElement.requestFullscreen();
		}
	}
</script>

<svelte:window {onkeydown} />

<div
	class="relative flex h-dvh w-dvw items-center justify-center overflow-hidden bg-background"
	style:text-rendering="geometricprecision"
>
	<canvas bind:this={canvas} class="block h-full w-full"></canvas>
</div>

<!--
	The speaker view reads notes and the active scene from the page, the same
	way it does for scene components.
-->
<div data-active hidden>
	<div data-notes>{scenes[sceneIndex]?.notes ?? ''}</div>
</div>

{#if showProgress}
	<div class="fixed right-0 bottom-0 left-0 z-10 h-[4px] bg-surface">
		<div class="h-full bg-accent transition-all" style:width="{progress}%"></div>
	</div>
{/if}
