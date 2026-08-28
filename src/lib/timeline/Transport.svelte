<script lang="ts">
	import IconButton from './IconButton.svelte';
	import type { TimelineController } from './timeline.svelte.js';

	interface Props {
		controller: TimelineController;
	}

	let { controller }: Props = $props();

	const SPEED_PRESETS = [0.25, 0.5, 1, 2] as const;

	const label = $derived(`${format(controller.time)} / ${format(controller.duration)}`);

	function format(seconds: number) {
		const minutes = Math.floor(seconds / 60);
		const rest = seconds - minutes * 60;
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
		Speed
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
			'rounded px-2 py-1 text-xs',
			{
				'bg-accent/30 text-foreground': controller.loop,
				'text-foreground/60 hover:bg-surface': !controller.loop
			}
		]}
		aria-pressed={controller.loop}
		title="Loop the scene (l)"
		onclick={() => (controller.loop = !controller.loop)}
	>
		Loop
	</button>
</div>
