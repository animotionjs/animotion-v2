<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		ASPECT_RATIOS,
		getOptions,
		RESOLUTIONS,
		type AspectRatio,
		type ResolutionName
	} from '../scene/options.js';
	import Picker from './Picker.svelte';
	import TimelineStage from './TimelineStage.svelte';
	import { cancelRender, openRenderFolder, renderStatus, startRender } from './render.remote.js';
	import type { Sequence } from '../scene/runtime/sequence.js';

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

	let aspect = $state<AspectRatio>(getOptions().aspectRatio.name);
	let resolution = $state<ResolutionName>(getOptions().render.resolution ?? '1080p');
	let rate = $state(fps);
	const ratio = $derived(ASPECT_RATIOS[aspect].width / ASPECT_RATIOS[aspect].height);

	type RenderScope = 'scene' | 'all';
	type Quality = 'full' | 'balanced' | 'preview';
	type Output = 'video' | 'images';

	let scope = $state<RenderScope>('scene');
	let quality = $state<Quality>('full');
	let output = $state<Output>('video');

	const aspectOptions = (Object.keys(ASPECT_RATIOS) as AspectRatio[]).map((name) => ({
		value: name,
		label: name
	}));
	const resolutionOptions = (Object.keys(RESOLUTIONS) as ResolutionName[]).map((name) => ({
		value: name,
		label: name
	}));
	const rateOptions = [30, 60].map((value) => ({ value, label: String(value) }));
	const scopeOptions: { value: RenderScope; label: string }[] = [
		{ value: 'scene', label: 'this scene' },
		{ value: 'all', label: 'all scenes' }
	];
	const qualityOptions: { value: Quality; label: string }[] = [
		{ value: 'full', label: 'full' },
		{ value: 'balanced', label: 'balanced' },
		{ value: 'preview', label: 'preview' }
	];
	const outputOptions: { value: Output; label: string }[] = [
		{ value: 'video', label: 'video' },
		{ value: 'images', label: 'images' }
	];

	const status = renderStatus();
	let actionError = $state<string | null>(null);

	const busy = $derived(
		status.current?.phase === 'rendering' || status.current?.phase === 'encoding'
	);

	const statusLabel = $derived.by(() => {
		const snapshot = status.current;
		if (!snapshot) return '';
		switch (snapshot.phase) {
			case 'rendering':
				return 'rendering…';
			case 'encoding':
				return 'finishing…';
			case 'done':
				return 'rendering done';
			case 'failed':
				return snapshot.error ? `failed. ${snapshot.error}` : 'failed.';
			default:
				return '';
		}
	});

	const statusTone = $derived(actionError ? 'text-red-400' : 'text-foreground/60');
	const doneOutput = $derived(status.current?.phase === 'done' ? status.current.output : null);
	const statusStrong = $derived.by(() => {
		switch (status.current?.phase) {
			case 'rendering':
				return `${status.current.percent}%`;
			case 'done':
				return ` (${formatDuration(status.current.duration ?? 0)})`;
			default:
				return null;
		}
	});

	function formatDuration(ms: number) {
		const total = Math.round(ms / 1000);
		if (total < 60) return `${total}s`;
		const minutes = Math.floor(total / 60);
		const rest = total - minutes * 60;
		return `${minutes}m ${String(rest).padStart(2, '0')}s`;
	}

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
				scene: scope === 'all' ? null : sceneId,
				aspect,
				resolution,
				fps: rate,
				quality,
				output,
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
			class="rounded px-2 py-1 text-xs text-foreground/60 hover:bg-surface disabled:opacity-30"
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
			class="rounded px-2 py-1 text-xs text-foreground/60 hover:bg-surface disabled:opacity-30"
			disabled={index >= sequence.length - 1}
			onclick={() => select(sequence[index + 1]!.id)}
		>
			›
		</button>

		<div class="ml-auto flex min-w-0 items-center gap-2">
			<Picker label="aspect" bind:value={aspect} options={aspectOptions} />
			<Picker label="resolution" bind:value={resolution} options={resolutionOptions} />
			<Picker label="fps" bind:value={rate} options={rateOptions} />
			<Picker label="scope" bind:value={scope} options={scopeOptions} />
			<Picker label="quality" bind:value={quality} options={qualityOptions} />
			<Picker label="output" bind:value={output} options={outputOptions} />
			<button
				type="button"
				class="inline-flex items-center gap-1 rounded bg-accent/30 px-2 py-1 text-xs text-foreground hover:bg-accent/40"
				onclick={busy ? () => cancelRender() : render}
			>
				{#if busy}
					<svg viewBox="0 0 18 16" class="h-4 w-4 fill-current" aria-hidden="true">
						<rect x="5" y="4" width="8" height="8" rx="1" />
					</svg>
				{:else}
					<svg viewBox="0 0 18 16" class="h-4 w-4 fill-current" aria-hidden="true">
						<rect x="1" y="4" width="10.5" height="8" rx="1.5" />
						<path d="M13 6.5 17 4v8l-4-2.5z" />
					</svg>
				{/if}
				{busy ? 'cancel' : 'render'}
			</button>
		</div>

		<!--
			Centered in the header so the render status can appear and change
			without shifting the pickers or buttons around it.
		-->
		{#if statusLabel || actionError || doneOutput !== null}
			<div
				class="pointer-events-none absolute top-1/2 left-1/2 flex max-w-96 -translate-x-1/2 -translate-y-1/2 items-center gap-2 text-xs {statusTone}"
			>
				{#if busy}
					<svg
						viewBox="0 0 18 16"
						class="h-4 w-4 shrink-0 animate-spin text-accent"
						aria-hidden="true"
					>
						<path
							d="M14.5 8A5.5 5.5 0 1 1 10.97 2.86"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					</svg>
				{:else if doneOutput !== null}
					<svg viewBox="0 0 18 16" class="h-4 w-4 shrink-0 text-green-400" aria-hidden="true">
						<path
							d="M4 8.5l3.5 3.5L14 4.5"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					</svg>
				{/if}
				<span class="truncate">
					{actionError ?? statusLabel}{#if statusStrong}<strong
							class={{ 'inline-block w-10': busy }}>{statusStrong}</strong
						>{/if}
				</span>
				{#if doneOutput !== null}
					<button
						type="button"
						class="pointer-events-auto inline-flex items-center gap-1 rounded bg-surface px-2 py-1 text-xs text-foreground hover:bg-accent/40"
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
				{/if}
			</div>
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
