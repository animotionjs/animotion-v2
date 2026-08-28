<script lang="ts">
	import { goto } from '$app/navigation';
	import { ASPECT_RATIOS, getOptions, type AspectRatio } from '../scene/options.js';
	import AspectPicker from './AspectPicker.svelte';
	import TimelineStage from './TimelineStage.svelte';
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
	const ratio = $derived(ASPECT_RATIOS[aspect].width / ASPECT_RATIOS[aspect].height);

	function select(id: string) {
		if (id !== sceneId) goto(`/timeline/${id}`);
	}
</script>

<div class="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
	<header
		class="flex items-center gap-2 border-b border-foreground/10 px-3 py-1 ui-chrome sm:px-4 sm:py-2"
	>
		<button
			type="button"
			class="rounded px-2 py-1 text-xs text-foreground/60 hover:bg-surface disabled:opacity-30"
			disabled={index <= 0}
			onclick={() => select(sequence[index - 1]!.id)}
		>
			‹
		</button>
		<select
			class="rounded bg-surface px-2 py-1 text-xs text-foreground"
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

		<div class="ml-auto">
			<AspectPicker bind:value={aspect} />
		</div>
	</header>

	{#snippet loadError(message: string)}
		<p class="flex flex-1 items-center justify-center text-foreground/50 ui-chrome">{message}</p>
	{/snippet}

	<svelte:boundary>
		{#key sceneId}
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
