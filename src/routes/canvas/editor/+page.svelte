<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import CanvasStage from '../../../canvas/CanvasStage.svelte';
	import EditorTimeline from '../../../canvas/EditorTimeline.svelte';
	import { project } from '../../../canvas/demo-project.js';
	import type { NodeSnapshot, SceneInstance } from '../../../canvas/scene.js';

	let sceneIndex = $state(0);
	let scene = $state<SceneInstance>(untrack(() => project.scenes[0]!.create()));
	let time = $state(0);
	let snapshot = $state<NodeSnapshot>(untrack(() => scene.snapshot()));
	let selectedId = $state<string | null>(null);
	let playing = $state(false);
	let frame = 0;
	let last = 0;

	const duration = $derived(scene.duration);
	const timeline = $derived(scene.timeline);
	const selected = $derived(findNode(snapshot, selectedId));

	type Row = { id: string; kind: string; depth: number; layoutKey?: string; opacity: number };
	const rows = $derived(flatten(snapshot));

	function flatten(node: NodeSnapshot, depth = 0): Row[] {
		const opacity = typeof node.values.opacity === 'number' ? node.values.opacity : 1;
		return [
			{ id: node.id, kind: node.kind, depth, layoutKey: node.layoutKey, opacity },
			...node.children.flatMap((child) => flatten(child, depth + 1))
		];
	}

	function findNode(node: NodeSnapshot, id: string | null): NodeSnapshot | null {
		if (!id) return null;
		if (node.id === id) return node;
		for (const child of node.children) {
			const found = findNode(child, id);
			if (found) return found;
		}
		return null;
	}

	function seek(next: number) {
		time = Math.min(duration, Math.max(0, next));
		scene.seek(time);
		snapshot = scene.snapshot();
	}

	function selectScene(index: number) {
		pause();
		sceneIndex = index;
		scene = project.scenes[index]!.create();
		time = 0;
		selectedId = null;
		snapshot = scene.snapshot();
	}

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
		const next = time + delta;
		if (next >= duration) {
			seek(duration);
			playing = false;
			return;
		}
		seek(next);
		frame = requestAnimationFrame(step);
	}

	function pause() {
		playing = false;
		if (typeof window !== 'undefined') cancelAnimationFrame(frame);
	}

	function toggle() {
		if (playing) pause();
		else play();
	}

	function saveFrame() {
		const canvas = document.querySelector('canvas');
		if (!canvas) return;
		const link = document.createElement('a');
		link.download = `${scene.id}-${time.toFixed(2)}.png`;
		link.href = canvas.toDataURL('image/png');
		link.click();
	}

	function format(value: unknown): string {
		if (typeof value === 'number')
			return Number.isInteger(value) ? String(value) : value.toFixed(3);
		if (value === null) return 'null';
		return String(value);
	}

	onDestroy(() => {
		if (typeof window === 'undefined') return;
		cancelAnimationFrame(frame);
	});
</script>

<div class="min-h-dvh bg-zinc-950 text-zinc-100">
	<header class="flex items-center justify-between gap-6 border-b border-zinc-800 px-6 py-4">
		<div>
			<p class="text-[10px] tracking-widest text-zinc-500 uppercase">Canvas editor</p>
			<h1 class="text-lg font-semibold">{project.id}</h1>
		</div>
		<div class="flex items-center gap-3">
			<span class="font-mono text-xs text-zinc-500">
				{time.toFixed(2)} / {duration.toFixed(2)}s
			</span>
			<button
				class="rounded-full bg-zinc-800 px-4 py-2 text-sm transition hover:bg-zinc-700"
				onclick={toggle}
			>
				{playing ? 'Pause' : 'Play'}
			</button>
			<button
				class="rounded-full border border-zinc-700 px-4 py-2 text-sm transition hover:bg-zinc-800"
				onclick={saveFrame}
			>
				Save frame
			</button>
		</div>
	</header>

	<div
		class="grid h-[calc(100dvh-4.25rem)] grid-cols-[220px_minmax(0,1fr)_300px] grid-rows-[minmax(0,1fr)_auto]"
	>
		<aside class="row-span-2 overflow-auto border-r border-zinc-800 p-3">
			<p class="mb-3 text-[10px] tracking-widest text-zinc-500 uppercase">Scenes</p>
			<div class="flex flex-col gap-2">
				{#each project.scenes as entry, index (entry.id)}
					<button
						class="rounded-lg border px-3 py-2 text-left text-sm transition {index === sceneIndex
							? 'border-amber-400/60 bg-amber-400/10'
							: 'border-zinc-800 hover:border-zinc-700'}"
						onclick={() => selectScene(index)}
					>
						<span class="block font-medium">{entry.id}</span>
						<span class="block text-xs text-zinc-500">
							{entry.chapter ?? 'Untitled'} · {entry.timeline().totalDuration.toFixed(2)}s
						</span>
					</button>
				{/each}
			</div>
		</aside>

		<main class="flex min-h-0 flex-col gap-4 p-4">
			<div class="overflow-hidden rounded-xl border border-zinc-800 bg-black">
				{#key scene}
					<CanvasStage
						{scene}
						{time}
						width={project.size.width}
						height={project.size.height}
						background={project.background}
					/>
				{/key}
			</div>

			<EditorTimeline {timeline} {time} onseek={seek} />

			<div class="flex flex-wrap gap-4 text-xs text-zinc-500">
				<span>Arrow keys are not wired yet.</span>
				<span>Playhead drives the canvas directly.</span>
			</div>
		</main>

		<aside class="row-span-2 overflow-auto border-l border-zinc-800 p-3">
			<p class="mb-3 text-[10px] tracking-widest text-zinc-500 uppercase">Scene graph</p>
			<div class="flex flex-col gap-1">
				{#each rows as row (row.id)}
					<button
						class="flex items-center gap-2 rounded px-2 py-1 text-left text-xs transition {selectedId ===
						row.id
							? 'bg-zinc-800'
							: 'hover:bg-zinc-900'}"
						style:padding-left="{row.depth * 12 + 8}px"
						onclick={() => (selectedId = row.id)}
					>
						<span class="text-zinc-500">{row.kind}</span>
						<span class="truncate font-mono">{row.id}</span>
						{#if row.layoutKey}
							<span class="ml-auto rounded bg-zinc-700/60 px-1 text-[10px]">
								{row.layoutKey}
							</span>
						{/if}
					</button>
				{/each}
			</div>

			{#if selected}
				<div class="mt-4 border-t border-zinc-800 pt-3">
					<p class="mb-2 text-[10px] tracking-widest text-zinc-500 uppercase">Properties</p>
					<div class="flex flex-col gap-1">
						{#each Object.entries(selected.values) as [key, value] (key)}
							<div class="flex justify-between gap-3 text-xs">
								<span class="text-zinc-500">{key}</span>
								<span class="truncate font-mono text-zinc-300">{format(value)}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</aside>

		<footer
			class="col-start-2 flex items-center justify-between border-t border-zinc-800 px-4 py-3"
		>
			<span class="text-xs text-zinc-500">{scene.id}</span>
			<span class="font-mono text-xs text-zinc-500">
				{timeline.steps.length} steps
			</span>
		</footer>
	</div>
</div>
