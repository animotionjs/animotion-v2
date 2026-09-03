<script lang="ts">
	import IconButton from '../components/IconButton.svelte';
	import type { TimelineController } from './timeline.svelte.js';

	interface Props {
		controller: TimelineController;
	}

	let { controller }: Props = $props();

	const SPEED_PRESETS = [0.25, 0.5, 1, 2] as const;

	const label = $derived(`${format(controller.time)} / ${format(controller.duration)}`);

	function format(seconds: number) {
		// rounding in hundredths keeps a 59.99x second from displaying as 60.00
		const total = Math.max(0, Math.round(seconds * 100));
		const minutes = Math.floor(total / 6000);
		const rest = (total % 6000) / 100;
		return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
	}
</script>

<div class="flex flex-wrap items-center gap-1 px-3 py-1 sm:px-4 sm:py-2">
	<div class="flex items-center gap-1">
		<IconButton label="Restart (Home)" onclick={() => controller.seekTo(0)}>
			<path d="M4 3v10M13 3L6.5 8 13 13z" />
		</IconButton>
		<IconButton label="Previous segment (ArrowLeft)" onclick={() => controller.jumpPrev()}>
			<path d="M9 3L3.5 8 9 13zM15.5 3L10 8l5.5 5z" />
		</IconButton>
		<IconButton label="One frame back (,)" onclick={() => controller.nudge(-1)}>
			<path d="M11 4L6 8l5 4z" />
		</IconButton>
		<IconButton
			label={controller.playing ? 'Pause (space)' : 'Play (space)'}
			onclick={() => controller.toggle()}
			accent
		>
			{#if controller.playing}
				<path d="M5 3h2.5v10H5zM10.5 3H13v10h-2.5z" />
			{:else}
				<path d="M5 3l9 5-9 5z" />
			{/if}
		</IconButton>
		<IconButton label="One frame forward (.)" onclick={() => controller.nudge(1)}>
			<path d="M7 4l5 4-5 4z" />
		</IconButton>
		<IconButton label="Next segment (ArrowRight)" onclick={() => controller.jumpNext()}>
			<path d="M9 3l5.5 5L9 13zM3 3l5.5 5L3 13z" />
		</IconButton>
		<IconButton label="Jump to end (End)" onclick={() => controller.seekTo(controller.duration)}>
			<path d="M14 3v10M5 3l6.5 5L5 13z" />
		</IconButton>
	</div>

	<span class="ml-2 font-mono text-xs text-foreground/80 tabular-nums sm:ml-3">{label}</span>

	<label class="ml-auto flex items-center gap-1 text-xs text-foreground/60">
		speed:
		<select
			class="rounded bg-surface px-1 py-1 text-xs text-foreground"
			name="speed"
			bind:value={controller.speed}
		>
			{#each SPEED_PRESETS as speed (speed)}
				<option value={speed}>{speed}×</option>
			{/each}
		</select>
	</label>

	<button
		type="button"
		class={[
			'inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
			{
				'bg-accent/30 text-foreground hover:bg-accent/40': controller.loop,
				'bg-surface text-foreground hover:bg-accent/40': !controller.loop
			}
		]}
		aria-pressed={controller.loop}
		title="loop the scene (l)"
		onclick={() => (controller.loop = !controller.loop)}
	>
		<svg viewBox="0 0 18 16" class="h-4 w-4" aria-hidden="true">
			<path
				d="M9 8C7 5.5 6 4.5 4.5 4.5C2.5 4.5 1 6 1 8C1 10 2.5 11.5 4.5 11.5C6 11.5 7 10.5 9 8C11 5.5 12 4.5 13.5 4.5C15.5 4.5 17 6 17 8C17 10 15.5 11.5 13.5 11.5C12 11.5 11 10.5 9 8z"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		loop
	</button>
</div>
