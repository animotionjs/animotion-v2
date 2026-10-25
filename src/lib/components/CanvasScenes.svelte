<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { AudioPlayer } from '../canvas/audio.js';
	import { CanvasRenderer } from '../canvas/renderer.js';
	import type { ProjectDefinition } from '../canvas/project.js';
	import type { SceneInstance } from '../canvas/scene.js';

	interface Props {
		project: ProjectDefinition;
	}

	let { project }: Props = $props();

	let canvas: HTMLCanvasElement | undefined;
	let renderer = $state<CanvasRenderer | null>(null);
	let audio = $state<AudioPlayer | null>(null);
	let sceneIndex = $state(0);
	let scene = $state<SceneInstance>(untrack(() => project.scenes[0]!.create()));
	let time = $state(0);
	let playing = $state(false);
	let outgoing = $state<SceneInstance | null>(null);
	let outgoingTime = $state(0);
	let transitionProgress = $state(1);
	let frame = 0;
	let transitionFrame = 0;
	let last = 0;
	let transitionStart = 0;
	let stopAt: number | null = null;

	const duration = $derived(scene.duration);
	const progress = $derived(
		((sceneIndex + (duration > 0 ? time / duration : 1)) / project.scenes.length) * 100
	);

	onMount(() => {
		if (!canvas) return;
		let cancelled = false;

		void document.fonts.ready.then(() => {
			if (cancelled || !canvas) return;
			renderer = new CanvasRenderer(canvas, scene, {
				width: project.size.width,
				height: project.size.height,
				background: project.background
			});
			audio = new AudioPlayer();
			audio.load(scene.audio);
			renderer.draw(0);
		});

		return () => {
			cancelled = true;
			renderer = null;
			audio?.stop();
			audio = null;
			cancelAnimationFrame(frame);
			cancelAnimationFrame(transitionFrame);
		};
	});

	$effect(() => {
		const current = renderer;
		if (!current) return;

		current.begin();
		if (outgoing && transitionProgress < 1) {
			current.drawScene(outgoing, outgoingTime, {
				opacity: 1 - transitionProgress,
				x: -transitionProgress * 1920,
				y: 0,
				scale: 1
			});
			current.drawScene(scene, time, {
				opacity: transitionProgress,
				x: (1 - transitionProgress) * 1920,
				y: 0,
				scale: 1
			});
		} else {
			current.drawScene(scene, time);
		}
		current.end();
		audio?.sync(time, playing);
	});

	function stepEnds(): number[] {
		let cursor = 0;
		return scene.timeline.steps.map((step) => {
			cursor += step.duration;
			return cursor;
		});
	}

	function seek(next: number) {
		time = Math.min(duration, Math.max(0, next));
	}

	function next() {
		pause();
		const target = stepEnds().find((end) => end > time + 1e-4);
		if (target !== undefined) {
			playTo(target);
			return;
		}
		if (sceneIndex < project.scenes.length - 1) switchScene(sceneIndex + 1);
	}

	function prev() {
		pause();
		const ends = stepEnds();
		const starts = [0, ...ends.slice(0, -1)];
		const target = [...starts].reverse().find((start) => start < time - 1e-4);
		if (target !== undefined) {
			seek(target);
			return;
		}
		if (sceneIndex > 0) switchScene(sceneIndex - 1);
	}

	function switchScene(index: number) {
		pause();
		outgoing = scene;
		outgoingTime = scene.duration;
		sceneIndex = index;
		const nextScene = project.scenes[index]!.create();
		scene = nextScene;
		audio?.load(nextScene.audio);
		time = 0;
		transitionProgress = 0;
		transitionStart = performance.now();
		cancelAnimationFrame(transitionFrame);
		transitionFrame = requestAnimationFrame(tickTransition);
	}

	function tickTransition(now: number) {
		const nextProgress = Math.min(1, (now - transitionStart) / 800);
		transitionProgress = nextProgress;
		if (nextProgress >= 1) {
			outgoing = null;
			return;
		}
		transitionFrame = requestAnimationFrame(tickTransition);
	}

	function play() {
		if (playing) return;
		if (time >= duration) time = 0;
		stopAt = null;
		playing = true;
		last = performance.now();
		frame = requestAnimationFrame(tick);
	}

	function playTo(target: number) {
		if (target <= time) return;
		stopAt = target;
		playing = true;
		last = performance.now();
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(tick);
	}

	function tick(now: number) {
		if (!playing) return;
		const delta = (now - last) / 1000;
		last = now;
		const limit = stopAt ?? duration;
		const nextTime = time + delta;

		if (nextTime >= limit) {
			seek(limit);
			playing = false;
			stopAt = null;
			return;
		}

		seek(nextTime);
		frame = requestAnimationFrame(tick);
	}

	function pause() {
		playing = false;
		stopAt = null;
		if (typeof window !== 'undefined') cancelAnimationFrame(frame);
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			next();
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			prev();
		} else if (event.key === ' ') {
			event.preventDefault();
			if (playing) pause();
			else play();
		} else if (event.key === 'f') {
			event.preventDefault();
			if (document.fullscreenElement) document.exitFullscreen();
			else void document.documentElement.requestFullscreen();
		}
	}

	onDestroy(() => {
		cancelAnimationFrame(frame);
		cancelAnimationFrame(transitionFrame);
	});
</script>

<svelte:window {onkeydown} />

<div
	class="relative flex h-dvh w-dvw items-center justify-center overflow-hidden bg-background"
	style:text-rendering="geometricprecision"
>
	<canvas
		bind:this={canvas}
		class="block max-h-full max-w-full"
		style:aspect-ratio="{project.size.width} / {project.size.height}"
	></canvas>
</div>

<div class="fixed right-0 bottom-0 left-0 z-10 h-[4px] bg-surface">
	<div class="h-full bg-accent transition-all" style:width="{progress}%"></div>
</div>
