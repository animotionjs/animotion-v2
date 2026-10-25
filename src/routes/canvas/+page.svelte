<script lang="ts">
	import { onDestroy } from 'svelte';
	import CanvasStage from '../../canvas/CanvasStage.svelte';
	import intro from '../../canvas/demo.js';

	const scene = intro.create();
	const duration = scene.duration;

	let time = $state(0);
	let playing = $state(false);
	let frame = 0;
	let last = 0;

	function play() {
		if (playing) return;
		if (time >= duration) time = 0;
		playing = true;
		last = performance.now();
		frame = requestAnimationFrame(step);
	}

	function step(now: number) {
		if (!playing) return;
		const delta = (now - last) / 1000;
		last = now;
		time = Math.min(duration, time + delta);
		if (time >= duration) {
			playing = false;
			return;
		}
		frame = requestAnimationFrame(step);
	}

	function pause() {
		playing = false;
		cancelAnimationFrame(frame);
	}

	function toggle() {
		if (playing) pause();
		else play();
	}

	onDestroy(() => {
		if (typeof window === 'undefined') return;
		cancelAnimationFrame(frame);
	});
</script>

<div class="min-h-dvh bg-zinc-950 p-6 text-zinc-100">
	<div class="mx-auto flex max-w-6xl flex-col gap-4">
		<header class="flex items-center justify-between gap-6">
			<div>
				<p class="text-xs tracking-widest text-zinc-500 uppercase">Canvas spike</p>
				<h1 class="text-2xl font-semibold">Generator and signals</h1>
			</div>
			<div class="flex items-center gap-3">
				<a class="text-sm text-zinc-400 hover:text-zinc-100" href="/canvas/editor">Editor</a>
				<a class="text-sm text-zinc-400 hover:text-zinc-100" href="/canvas/presentation">
					Presentation
				</a>
				<button
					class="rounded-full bg-zinc-800 px-4 py-2 text-sm transition hover:bg-zinc-700"
					onclick={toggle}
				>
					{playing ? 'Pause' : 'Play'}
				</button>
			</div>
		</header>

		<div class="overflow-hidden rounded-2xl border border-zinc-800 bg-black">
			<CanvasStage {scene} {time} />
		</div>

		<div class="flex items-center gap-4">
			<input
				class="flex-1 accent-amber-400"
				type="range"
				min="0"
				max={duration}
				step="0.01"
				bind:value={time}
			/>
			<span class="w-32 text-right font-mono text-sm text-zinc-400">
				{time.toFixed(2)} / {duration.toFixed(2)}s
			</span>
		</div>

		<p class="text-sm text-zinc-500">
			Drag the playhead or press play. The canvas draws at 1920 by 1080 and scales with CSS.
		</p>
	</div>
</div>
