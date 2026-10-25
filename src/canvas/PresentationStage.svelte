<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { AudioPlayer } from './audio.js';
	import { CanvasRenderer } from './renderer.js';
	import type { ProjectDefinition } from './project.js';
	import type { SceneInstance } from './scene.js';

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
	const sceneLabel = $derived(`${sceneIndex + 1} / ${project.scenes.length}`);

	onMount(() => {
		if (!canvas) return;
		renderer = new CanvasRenderer(canvas, scene, {
			width: project.size.width,
			height: project.size.height,
			background: project.background
		});
		audio = new AudioPlayer();
		audio.load(scene.audio);
		renderer.draw(0);
		return () => {
			renderer = null;
			audio?.stop();
			audio = null;
			if (typeof window !== 'undefined') {
				cancelAnimationFrame(frame);
				cancelAnimationFrame(transitionFrame);
			}
		};
	});

	/*
		Canvas painting is an external side effect. Driving it from the same
		state that drives the timeline keeps seeking and playback identical.
	*/
	$effect(() => {
		const current = renderer;
		if (!current) return;

		current.begin();
		if (outgoing && transitionProgress < 1) {
			current.drawScene(outgoing, outgoingTime, {
				opacity: 1 - transitionProgress,
				x: 0,
				y: 0,
				scale: 1
			});
			current.drawScene(scene, time, {
				opacity: transitionProgress,
				x: 0,
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
		const ends = stepEnds();
		const target = ends.find((end) => end > time + 1e-4);
		if (target !== undefined) {
			playTo(target);
			return;
		}
		if (sceneIndex < project.scenes.length - 1) nextScene();
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
		if (sceneIndex > 0) prevScene();
	}

	function nextScene() {
		if (sceneIndex >= project.scenes.length - 1) return;
		switchScene(sceneIndex + 1);
	}

	function prevScene() {
		if (sceneIndex <= 0) return;
		switchScene(sceneIndex - 1);
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
		const nextProgress = Math.min(1, (now - transitionStart) / 450);
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

	function toggle() {
		if (playing) pause();
		else play();
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
			toggle();
		} else if (event.key === 'f') {
			event.preventDefault();
			if (document.fullscreenElement) document.exitFullscreen();
			else void document.documentElement.requestFullscreen();
		}
	}

	onDestroy(() => {
		if (typeof window === 'undefined') return;
		cancelAnimationFrame(frame);
		cancelAnimationFrame(transitionFrame);
	});
</script>

<svelte:window {onkeydown} />

<div class="flex h-dvh flex-col bg-black text-zinc-100">
	<div class="flex flex-1 items-center justify-center overflow-hidden p-4">
		<canvas
			bind:this={canvas}
			class="block max-h-full max-w-full"
			style:aspect-ratio="{project.size.width} / {project.size.height}"
		></canvas>
	</div>

	<footer class="flex items-center justify-between border-t border-zinc-900 px-5 py-3">
		<div class="flex items-center gap-3 text-xs text-zinc-500">
			<span class="font-mono">{sceneLabel}</span>
			<span>{scene.id}</span>
			<span>
				{time.toFixed(2)} / {duration.toFixed(2)}s
			</span>
		</div>
		<div class="flex items-center gap-2">
			<button class="rounded-full px-3 py-1 text-sm hover:bg-zinc-900" onclick={prev}>←</button>
			<button class="rounded-full bg-zinc-800 px-4 py-1 text-sm hover:bg-zinc-700" onclick={toggle}>
				{playing ? 'Pause' : 'Play'}
			</button>
			<button class="rounded-full px-3 py-1 text-sm hover:bg-zinc-900" onclick={next}>→</button>
		</div>
	</footer>
</div>
