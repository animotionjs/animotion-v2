<script lang="ts">
	import type { SceneTimeline } from './scene.js';

	interface Props {
		timeline: SceneTimeline;
		time: number;
		onseek: (time: number) => void;
	}

	let { timeline, time, onseek }: Props = $props();

	let track = $state<HTMLDivElement | null>(null);
	let dragging = $state(false);

	const total = $derived(Math.max(0.001, timeline.totalDuration));
	const playhead = $derived((time / total) * 100);

	const colors: Record<string, string> = {
		tween: 'bg-amber-500/30 border-amber-500/40',
		wait: 'bg-zinc-700/30 border-zinc-600/40',
		layout: 'bg-sky-500/30 border-sky-500/40',
		camera: 'bg-violet-500/30 border-violet-500/40',
		code: 'bg-emerald-500/30 border-emerald-500/40',
		parallel: 'bg-orange-500/30 border-orange-500/40'
	};

	function seek(event: PointerEvent) {
		const element = track;
		if (!element) return;
		const rect = element.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
		onseek(ratio * timeline.totalDuration);
	}

	function down(event: PointerEvent) {
		dragging = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		seek(event);
	}

	function move(event: PointerEvent) {
		if (!dragging) return;
		seek(event);
	}

	function up() {
		dragging = false;
	}
</script>

<div class="flex flex-col gap-2">
	<div class="flex items-center justify-between text-xs text-zinc-500">
		<span>{timeline.steps.length} steps</span>
		<span>{timeline.totalDuration.toFixed(2)}s</span>
	</div>

	<div
		bind:this={track}
		class="relative flex h-12 cursor-ew-resize overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900"
		role="slider"
		tabindex="0"
		aria-valuemin="0"
		aria-valuemax={timeline.totalDuration}
		aria-valuenow={time}
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
	>
		{#each timeline.steps as step (step.index)}
			<div
				class="flex min-w-0 items-center border-r border-black/30 px-2 text-[10px] text-zinc-300 {colors[
					step.label
				] ?? 'bg-zinc-700/30'}"
				style:width="{(step.duration / total) * 100}%"
				title="{step.label} {step.duration.toFixed(2)}s"
			>
				<span class="truncate">{step.label}</span>
			</div>
		{/each}

		<div class="pointer-events-none absolute inset-y-0 w-px bg-amber-300" style:left="{playhead}%">
			<div class="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-amber-300"></div>
		</div>
	</div>
</div>
