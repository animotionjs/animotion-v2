<script lang="ts">
	import IconButton from '../components/IconButton.svelte';
	import EditorInputFilters from './EditorInputFilters.svelte';
	import type { EditorController } from './controller.svelte.js';
	import type { EditorVoiceover } from './voiceover.svelte.js';

	interface Props {
		/** The clock this transport drives. */
		controller: EditorController;
		/** The voiceover track this transport records into. */
		voiceover: EditorVoiceover;
	}

	let { controller, voiceover }: Props = $props();

	/** Formats seconds as minutes and hundredths, the way the renderer reports time. */
	function format(seconds: number) {
		// rounding in hundredths keeps a 59.99x second from displaying as 60.00
		const total = Math.max(0, Math.round(seconds * 100));
		const minutes = Math.floor(total / 6000);
		const rest = (total % 6000) / 100;
		return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
	}

	function onkeydown(event: KeyboardEvent) {
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			(target.closest('input, select, textarea') || target.isContentEditable)
		)
			return;
		// held toggle keys would flip on every repeat, so only stepping keys repeat
		if (event.repeat && event.key === ' ') return;
		const shift = event.shiftKey;
		switch (event.key) {
			case ' ':
				event.preventDefault();
				controller.toggle();
				break;
			case 'ArrowLeft':
				event.preventDefault();
				if (shift) controller.previousScene();
				else controller.nudge(-1);
				break;
			case 'ArrowRight':
				event.preventDefault();
				if (shift) controller.nextScene();
				else controller.nudge(1);
				break;
			case 'Home':
				event.preventDefault();
				controller.seek(0);
				break;
			case 'End':
				event.preventDefault();
				controller.seek(controller.total);
				break;
			case '+':
			case '=':
				controller.zoomIn();
				break;
			case '-':
			case '_':
				controller.zoomOut();
				break;
			case 'f':
			case 'F':
				controller.zoomToFit();
				break;
			case 'r':
			case 'R':
				if (!event.metaKey && !event.ctrlKey && !event.altKey) void voiceover.toggleRecord();
				break;
			case 'z':
			case 'Z':
				// Ctrl+Z takes an edit back, Ctrl+Shift+Z puts it forward again
				if (!event.metaKey && !event.ctrlKey) break;
				event.preventDefault();
				if (shift) void voiceover.redo();
				else void voiceover.undo();
				break;
		}
	}
</script>

<svelte:window {onkeydown} />

<div class="flex flex-wrap items-center gap-1 px-3 py-1 ui-chrome sm:px-4 sm:py-2">
	<div class="flex items-center gap-1">
		<IconButton label="Go to start (Home)" onclick={() => controller.seek(0)}>
			<path d="M4 3v10M13 3L6.5 8 13 13z" />
		</IconButton>
		<IconButton label="Previous scene (Shift+ArrowLeft)" onclick={() => controller.previousScene()}>
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
		<IconButton label="Next scene (Shift+ArrowRight)" onclick={() => controller.nextScene()}>
			<path d="M9 3l5.5 5L9 13zM3 3l5.5 5L3 13z" />
		</IconButton>
		<IconButton label="Go to end (End)" onclick={() => controller.seek(controller.total)}>
			<path d="M14 3v10M5 3l6.5 5L5 13z" />
		</IconButton>
	</div>

	<span class="ml-2 font-mono text-xs text-foreground/80 tabular-nums sm:ml-3">
		{format(controller.time)} / {format(controller.total)}
	</span>

	{#if voiceover.message}
		<span class="text-xs text-amber-300/90">{voiceover.message}</span>
	{/if}

	<div class="ml-2 flex items-center gap-1 sm:ml-3">
		<EditorInputFilters {voiceover} />
		<button
			type="button"
			class={[
				'inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
				{
					'bg-red-500/80 text-white': voiceover.recording,
					'bg-surface text-foreground hover:bg-accent/40': !voiceover.recording
				},
				!voiceover.canRecord && 'opacity-50'
			]}
			disabled={!voiceover.canRecord}
			aria-pressed={voiceover.recording}
			title="record a voiceover from the playhead (r)"
			onclick={() => void voiceover.toggleRecord()}
		>
			<svg viewBox="0 0 18 16" class="h-4 w-4" aria-hidden="true">
				<circle
					cx="9"
					cy="8"
					r={voiceover.recording ? 4 : 5.5}
					fill={voiceover.recording ? 'currentColor' : 'none'}
					stroke="currentColor"
					stroke-width="2"
				/>
			</svg>
			{#if voiceover.saving}
				saving…
			{:else if voiceover.recording}
				stop
			{:else}
				record
			{/if}
		</button>

		<button
			type="button"
			class={[
				'inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
				{
					'bg-accent/30 text-foreground hover:bg-accent/40': controller.voiceover,
					'bg-surface text-foreground/50 hover:bg-accent/40': !controller.voiceover
				}
			]}
			aria-pressed={controller.voiceover}
			title={controller.voiceover
				? 'mute the voiceover in the preview'
				: 'hear the voiceover while playing'}
			onclick={() => (controller.voiceover = !controller.voiceover)}
		>
			<svg viewBox="0 0 18 16" class="h-4 w-4" aria-hidden="true">
				<path
					d="M3 6.5h2.5L9 3.5v9L5.5 9.5H3z"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linejoin="round"
				/>
				{#if controller.voiceover}
					<path
						d="M11.5 5.5a4 4 0 0 1 0 5M13.5 3.5a7 7 0 0 1 0 9"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				{:else}
					<path
						d="M11.5 6l4 4M15.5 6l-4 4"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				{/if}
			</svg>
			voiceover
		</button>

		<button
			type="button"
			class="inline-flex cursor-pointer items-center gap-1 rounded bg-surface px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent/40 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-surface"
			title="undo the last move or rename (Ctrl+Z)"
			disabled={!voiceover.canUndo}
			onclick={() => void voiceover.undo()}
		>
			<svg viewBox="0 0 18 16" class="h-4 w-4" aria-hidden="true">
				<path
					d="M4.5 6.5H11a3.5 3.5 0 0 1 0 7H7"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path
					d="M7 3.5 4 6.5l3 3"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			undo
		</button>

		<button
			type="button"
			class="inline-flex cursor-pointer items-center gap-1 rounded bg-surface px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent/40 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-surface"
			title="redo the edit that was taken back (Ctrl+Shift+Z)"
			disabled={!voiceover.canRedo}
			onclick={() => void voiceover.redo()}
		>
			<svg viewBox="0 0 18 16" class="h-4 w-4" aria-hidden="true">
				<path
					d="M13.5 6.5H7a3.5 3.5 0 0 0 0 7h4"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path
					d="M11 3.5l3 3-3 3"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			redo
		</button>
	</div>

	<div class="ml-auto flex items-center gap-1">
		<span class="text-xs text-foreground/50">zoom</span>
		<button
			type="button"
			class="cursor-pointer rounded bg-surface px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent/40"
			title="zoom out (-)"
			onclick={() => controller.zoomOut()}
		>
			−
		</button>
		<button
			type="button"
			class="cursor-pointer rounded bg-surface px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent/40"
			title="reset zoom to fit (f)"
			onclick={() => controller.zoomToFit()}
		>
			fit
		</button>
		<button
			type="button"
			class="cursor-pointer rounded bg-surface px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent/40"
			title="zoom in (+)"
			onclick={() => controller.zoomIn()}
		>
			+
		</button>
	</div>
</div>
