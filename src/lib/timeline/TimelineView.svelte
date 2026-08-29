<script lang="ts">
	import { goto } from '$app/navigation';
	import { ASPECT_RATIOS, getOptions } from '../scene/options.js';
	import RenderButton from './RenderButton.svelte';
	import RenderMenu from './RenderMenu.svelte';
	import TimelineStage from './TimelineStage.svelte';
	import { cancelRender, openRenderFolder, renderStatus, startRender } from './render.remote.js';
	import type { Sequence } from '../scene/runtime/sequence.js';
	import type { RenderSettings } from './render-settings.js';

	interface Props {
		/** Ordered scenes to preview. */
		sequence: Sequence;
		/** The scene to show, matching a `sequence` id. */
		sceneId: string;
	}

	let { sequence, sceneId }: Props = $props();

	const index = $derived(
		Math.max(
			0,
			sequence.findIndex((entry) => entry.id === sceneId)
		)
	);
	const entry = $derived(sequence[index]);
	const fps = getOptions().render.fps;

	let settings = $state<RenderSettings>({
		aspect: getOptions().aspectRatio.name,
		resolution: getOptions().render.resolution ?? '1080p',
		rate: fps,
		scope: 'scene',
		quality: 'full',
		output: 'video'
	});
	const ratio = $derived(
		ASPECT_RATIOS[settings.aspect].width / ASPECT_RATIOS[settings.aspect].height
	);

	const status = renderStatus();
	let actionError = $state<string | null>(null);
	const renderError = $derived(status.current?.phase === 'failed' ? status.current.error : null);
	const headerError = $derived(actionError ?? renderError);

	function select(id: string) {
		if (id !== sceneId) goto(`/timeline/${id}`);
	}

	function messageOf(error: unknown) {
		if (error instanceof Error) return error.message;
		const body = (error as { body?: { message?: unknown } } | null)?.body;
		return typeof body?.message === 'string' ? body.message : String(error);
	}

	async function render() {
		actionError = null;
		try {
			await startRender({
				scene: settings.scope === 'all' ? null : sceneId,
				aspect: settings.aspect,
				resolution: settings.resolution,
				fps: settings.rate,
				quality: settings.quality,
				output: settings.output,
				// the renderer attaches to the dev server serving this page
				origin: location.origin
			});
		} catch (e) {
			actionError = messageOf(e);
		}
	}

	async function reveal() {
		actionError = null;
		try {
			await openRenderFolder();
		} catch (e) {
			actionError = messageOf(e);
		}
	}
</script>

<div class="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
	<header
		class="relative flex items-center gap-2 border-b border-foreground/10 px-3 py-1 ui-chrome sm:px-4 sm:py-2"
	>
		<label for="scene" class="text-xs text-foreground/60">scenes:</label>
		<button
			type="button"
			class="cursor-pointer rounded px-2 py-1 text-xs text-foreground/60 transition-colors hover:bg-surface disabled:opacity-30"
			disabled={index <= 0}
			onclick={() => select(sequence[index - 1]!.id)}
		>
			‹
		</button>
		<select
			id="scene"
			class="rounded bg-surface px-1 py-1 text-xs text-foreground"
			name="scene"
			value={sceneId}
			onchange={(event) => select(event.currentTarget.value)}
		>
			{#each sequence as scene (scene.id)}
				<option value={scene.id}>{scene.id}</option>
			{/each}
		</select>
		<button
			type="button"
			class="cursor-pointer rounded px-2 py-1 text-xs text-foreground/60 transition-colors hover:bg-surface disabled:opacity-30"
			disabled={index >= sequence.length - 1}
			onclick={() => select(sequence[index + 1]!.id)}
		>
			›
		</button>

		<div class="ml-auto flex items-center gap-2">
			<RenderButton {status} onstart={render} oncancel={() => cancelRender()} />
			<button
				type="button"
				class="inline-flex cursor-pointer items-center gap-1 rounded bg-surface px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent/40"
				title="open output folder"
				onclick={reveal}
			>
				<svg viewBox="0 0 18 16" class="h-4 w-4" aria-hidden="true">
					<path
						d="M2 4.5c0-.8.7-1.5 1.5-1.5h3l1.5 2h8c.8 0 1.5.7 1.5 1.5v6c0 .8-.7 1.5-1.5 1.5H3.5c-.8 0-1.5-.7-1.5-1.5z"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linejoin="round"
					/>
				</svg>
				open
			</button>
			<RenderMenu bind:settings />
		</div>

		{#if headerError}
			<p
				class="pointer-events-none absolute top-1/2 left-1/2 max-w-96 -translate-x-1/2 -translate-y-1/2 truncate text-xs text-red-400"
			>
				{headerError}
			</p>
		{/if}
	</header>

	{#snippet loadError(message: string)}
		<p class="flex flex-1 items-center justify-center text-foreground/50 ui-chrome">{message}</p>
	{/snippet}

	<svelte:boundary>
		<!--
			Keyed by fps as well, so a frame rate change rebuilds the stage and
			its controller instead of leaving the preview stepping on the old grid.
		-->
		{#key `${sceneId}:${fps}`}
			{#await entry.component() then { default: Content }}
				<TimelineStage {sceneId} {fps} {ratio}>
					<Content />
				</TimelineStage>
			{:catch error}
				{@render loadError(error instanceof Error ? error.message : String(error))}
			{/await}
		{/key}

		{#snippet failed(renderError: unknown)}
			{@render loadError(renderError instanceof Error ? renderError.message : String(renderError))}
		{/snippet}
	</svelte:boundary>
</div>
