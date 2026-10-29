<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { defaultSequence } from '../config/scenes.js';
	import { SlideRuntime, setSlide } from '../slides/context.svelte.js';
	import type { SceneEntry, Sequence } from '../slides/sequence.js';
	import {
		playExitScene,
		resolveSceneTransition,
		type SceneDirection,
		type SceneTransition
	} from '../slides/transitions.js';
	import {
		speakerChannelName,
		SpeakerSession,
		type SpeakerMessage,
		type SpeakerState
	} from '../slides/speaker.js';
	import Scene from './Scene.svelte';
	import Markdown from './Markdown.svelte';

	interface Props {
		sequence?: Sequence;
		transition?: SceneTransition;
		duration?: number;
		slug?: string;
		embed?: boolean;
	}

	let {
		sequence = defaultSequence,
		transition = 'slide',
		duration = 450,
		slug,
		embed = false
	}: Props = $props();

	const runtime = new SlideRuntime();
	setSlide(runtime);

	const sceneCount = $derived(sequence.length);
	let hash = $state('');
	const position = $derived(readPosition(hash, sceneCount));
	const current: SceneEntry | undefined = $derived(sequence[position.scene] ?? sequence[0]);
	const currentTransition = $derived(
		resolveSceneTransition(current?.transition, transition, duration)
	);
	const speakerUrl = $derived(slug ? `/speaker/${encodeURIComponent(slug)}` : undefined);
	const progress = $derived.by(() => {
		if (sceneCount === 0) return 0;
		const within = runtime.max > 0 ? runtime.step / runtime.max : 0;
		return ((position.scene + within) / sceneCount) * 100;
	});

	let started = false;
	let targetScene = 0;
	let direction = $state<SceneDirection>('forward');
	let exitLayer = $state<HTMLElement>();
	let speaker: SpeakerSession | null = null;
	let connected = $state(false);

	runtime.reset(0);
	runtime.onReady = () => {
		if (started) writeHash(targetScene, runtime.step);
	};

	function closeSpeaker() {
		speaker?.close();
		speaker = null;
		connected = false;
	}

	onMount(() => {
		if (typeof BroadcastChannel !== 'undefined' && slug) {
			speaker = new SpeakerSession(speakerChannelName(slug));
			speaker.onmessage = handleSpeakerMessage;
			connected = true;
			if (embed) speaker.post({ type: 'hello' });
		}

		if (sceneCount === 0) return closeSpeaker;

		const nextHash = window.location.hash;
		const target = readPosition(nextHash, sceneCount);
		started = true;
		targetScene = target.scene;

		if (target.scene !== position.scene) {
			hash = nextHash;
			runtime.reset(target.step);
			return closeSpeaker;
		}

		if (target.step !== runtime.step) runtime.jump(target.step);
		writeHash(target.scene, runtime.step);

		return closeSpeaker;
	});

	function buildSpeakerState(): SpeakerState {
		return {
			sceneId: current?.id ?? '',
			sceneIndex: position.scene,
			totalScenes: sceneCount,
			step: runtime.step,
			max: runtime.max,
			scenes: sequence.map((scene) => ({ id: scene.id })),
			aspectRatio: { width: 16, height: 9 },
			notes: runtime.root?.querySelector<HTMLElement>('[data-notes]')?.innerHTML ?? ''
		};
	}

	function handleSpeakerMessage(message: SpeakerMessage) {
		if (embed) {
			if (message.type === 'state') applySpeakerState(message.state);
			return;
		}

		switch (message.type) {
			case 'next':
				next();
				break;
			case 'prev':
				prev();
				break;
			case 'goto': {
				const index = sequence.findIndex((scene) => scene.id === message.id);
				if (index >= 0) goTo(index, 0);
				break;
			}
			case 'hello':
				speaker?.post({ type: 'state', state: buildSpeakerState() });
				break;
		}
	}

	function applySpeakerState(state: SpeakerState) {
		if (state.sceneIndex < 0 || state.sceneIndex >= sceneCount) return;

		if (state.sceneIndex === position.scene) {
			if (state.step !== runtime.step) {
				/*
				 * Use the normal step path so the preview runs the same layout
				 * and code animations as the presenter. Only fall back to an
				 * instant jump when the scene has not measured its steps yet.
				 */
				if (runtime.max === 0 && state.step > 0) runtime.jump(state.step);
				else runtime.setStep(state.step);
				writeHash(state.sceneIndex, runtime.step);
			}
			return;
		}

		switchScene(
			state.sceneIndex,
			state.step,
			state.sceneIndex > position.scene ? 'forward' : 'backward'
		);
	}

	$effect(() => {
		void connected;
		void embed;
		void position.scene;
		void runtime.step;
		void runtime.max;
		void runtime.root;
		void current?.id;
		if (!connected || embed || !speaker) return;
		speaker.post({ type: 'state', state: buildSpeakerState() });
	});

	function openSpeaker() {
		if (embed || !speakerUrl || typeof window === 'undefined') return;
		window.open(speakerUrl, `animotion-speaker-${slug ?? 'default'}`, 'width=1200,height=800');
	}

	function readPosition(value: string, count: number): { scene: number; step: number } {
		const raw = value.slice(1);
		if (raw === '') return { scene: 0, step: 0 };

		const [sceneText, stepText] = raw.split('.');
		const last = Math.max(0, count - 1);
		const scene = Math.max(0, Math.min((Number(sceneText) || 1) - 1, last));
		const step = Math.max(0, Number(stepText) || 0);
		return { scene, step };
	}

	function writeHash(scene: number, step: number) {
		const next = step > 0 && Number.isFinite(step) ? `#${scene + 1}.${step}` : `#${scene + 1}`;
		if (hash === next) return;
		hash = next;
		if (typeof window === 'undefined') return;

		const url = `${window.location.pathname}${window.location.search}${next}`;
		void goto(url, { shallow: true, replace: true });
	}

	/** Copies the old scene into the stage so it can animate out. */
	function playExit(nextDirection: SceneDirection) {
		const root = runtime.root;
		if (!root || !exitLayer) return;

		const config = resolveSceneTransition(current?.transition, transition, duration);
		playExitScene(exitLayer, root, config.exit, nextDirection, config.duration);
	}

	function switchScene(scene: number, step: number, nextDirection: SceneDirection) {
		if (scene === position.scene) {
			runtime.setStep(step);
			writeHash(scene, runtime.step);
			return;
		}
		if (scene < 0 || scene >= sceneCount) return;

		playExit(nextDirection);
		direction = nextDirection;
		targetScene = scene;
		runtime.reset(step);
		writeHash(scene, Number.isFinite(step) ? step : 0);
	}

	function goTo(scene: number, step = 0) {
		const nextDirection: SceneDirection = scene < position.scene ? 'backward' : 'forward';
		switchScene(scene, step, nextDirection);
	}

	function next() {
		if (runtime.next()) {
			writeHash(position.scene, runtime.step);
			return;
		}
		switchScene(position.scene + 1, 0, 'forward');
	}

	function prev() {
		if (runtime.prev()) {
			writeHash(position.scene, runtime.step);
			return;
		}
		switchScene(position.scene - 1, Number.POSITIVE_INFINITY, 'backward');
	}

	function goToEnd() {
		const last = sceneCount - 1;
		if (last < 0) return;
		if (last === position.scene) {
			runtime.setStep(runtime.max);
			writeHash(last, runtime.max);
			return;
		}
		switchScene(last, Number.POSITIVE_INFINITY, 'forward');
	}

	function onHashChange() {
		if (!started) return;
		const nextHash = window.location.hash;
		if (nextHash === hash) return;

		const before = position.scene;
		const target = readPosition(nextHash, sceneCount);
		if (target.scene === before) {
			hash = nextHash;
			runtime.jump(target.step);
			writeHash(target.scene, runtime.step);
			return;
		}
		switchScene(target.scene, target.step, target.scene > before ? 'forward' : 'backward');
	}

	function toggleFullscreen() {
		if (typeof document === 'undefined') return;
		if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
		else void document.documentElement.requestFullscreen().catch(() => {});
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		if (embed) {
			if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
				event.preventDefault();
				speaker?.post({ type: event.key === 'ArrowRight' ? 'next' : 'prev' });
			}
			return;
		}

		const tag = event.target instanceof HTMLElement ? event.target.tagName : '';
		if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
		/*
		 * Let a focused button handle its own activation so space and enter do
		 * not advance twice.
		 */
		if (tag === 'BUTTON' && (event.key === ' ' || event.key === 'Enter')) return;

		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
			case ' ':
			case 'PageDown':
				event.preventDefault();
				next();
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
			case 'PageUp':
				event.preventDefault();
				prev();
				break;
			case 'Home':
				event.preventDefault();
				goTo(0, 0);
				break;
			case 'End':
				event.preventDefault();
				goToEnd();
				break;
			case 's':
			case 'S':
				openSpeaker();
				break;
			case 'f':
			case 'F':
				toggleFullscreen();
				break;
		}
	}
</script>

<svelte:window {onkeydown} onhashchange={onHashChange} />

{#if current}
	<div
		class="flex h-dvh w-dvw items-center justify-center overflow-hidden bg-background"
		style:text-rendering="geometricprecision"
	>
		<section
			class="@container relative aspect-video overflow-hidden bg-background text-foreground"
			style:width="min(100dvw, calc(100dvh * 16 / 9))"
		>
			<div bind:this={exitLayer} class="pointer-events-none absolute inset-0 z-20"></div>

			<div class="relative z-10 h-full w-full">
				{#key current.id}
					<Scene enter={currentTransition.enter} {direction} duration={currentTransition.duration}>
						{#if current.kind === 'markdown'}
							<Markdown source={current.source} />
						{:else}
							{@const Component = current.component}
							<Component />
						{/if}
					</Scene>
				{/key}
			</div>
		</section>
	</div>

	{#if !embed}
		<div class="fixed top-4 right-4 z-20 flex items-center gap-2 ui-chrome">
			{#if speakerUrl}
				<button
					type="button"
					class="cursor-pointer rounded-full bg-black/60 px-4 py-2 text-sm text-white/80 backdrop-blur hover:text-white"
					title="Speaker view (s)"
					onclick={openSpeaker}
				>
					Speaker
				</button>
			{/if}
			<button
				type="button"
				class="cursor-pointer rounded-full bg-black/60 px-4 py-2 text-sm text-white/80 backdrop-blur hover:text-white"
				title="Fullscreen (f)"
				onclick={toggleFullscreen}
			>
				Fullscreen
			</button>
		</div>

		<div
			class="fixed bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-4 rounded-full bg-black/60 px-5 py-2 text-sm text-white/80 backdrop-blur ui-chrome"
		>
			<button type="button" class="cursor-pointer px-2 hover:text-white" onclick={prev}>
				Prev
			</button>
			<span>{position.scene + 1} / {sceneCount}</span>
			<span class="opacity-40">step {runtime.step} / {runtime.max}</span>
			<button type="button" class="cursor-pointer px-2 hover:text-white" onclick={next}>
				Next
			</button>
		</div>

		<div class="fixed right-0 bottom-0 left-0 z-10 h-1 bg-surface">
			<div class="h-full bg-accent transition-[width] duration-300" style:width="{progress}%"></div>
		</div>
	{/if}
{:else}
	<div class="flex h-dvh items-center justify-center bg-background text-foreground ui-chrome">
		<p class="text-lg opacity-60">No scenes found in this presentation.</p>
	</div>
{/if}
