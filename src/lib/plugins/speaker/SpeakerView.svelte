<script lang="ts">
	import { onMount } from 'svelte';

	import { SlidePreview } from '#lib';
	import { SPEAKER_CHANNEL, SpeakerChannel } from './channel';

	import type { Snippet } from 'svelte';
	import type { Sequence } from '#lib';
	import type { SpeakerMessage, SpeakerState } from './channel';

	interface Props {
		/** The presentation sequence, for rendering slide previews. */
		sequence: Sequence;
		/** The `BroadcastChannel` name shared with the presentation window. */
		channel?: string;
	}

	let { sequence, channel: channelName = SPEAKER_CHANNEL }: Props = $props();

	let presentation = $state<SpeakerState | null>(null);
	let elapsed = $state(0);

	let channel: SpeakerChannel | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;

	const ratio = $derived(
		presentation ? presentation.aspectRatio.width / presentation.aspectRatio.height : 16 / 9
	);
	const nextId = $derived.by(() => {
		if (!presentation) return null;
		const next = presentation.sceneIndex + 1;
		return next < presentation.scenes.length ? presentation.scenes[next].id : null;
	});
	let sceneModules = $state<Record<string, { notes?: Snippet }>>({});
	const notes = $derived.by(() => {
		const candidate = sceneModules[presentation?.sceneId ?? '']?.notes;
		return typeof candidate === 'function' ? (candidate as Snippet) : undefined;
	});

	function send(message: SpeakerMessage) {
		channel?.post(message);
	}

	function formatTime(total: number) {
		const minutes = Math.floor(total / 60);
		const seconds = Math.floor(total % 60);
		return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}

	function toggleFullscreen() {
		if (document.fullscreenElement) {
			void document.exitFullscreen();
		} else if (document.fullscreenEnabled) {
			void document.documentElement.requestFullscreen();
		}
	}

	onMount(() => {
		let cancelled = false;
		void Promise.all(
			sequence.map(async (scene) => [scene.id, await scene.component()] as const)
		).then((modules) => {
			if (cancelled) return;
			sceneModules = Object.fromEntries(
				modules.map(([id, module]) => [
					id,
					{ notes: typeof module.notes === 'function' ? module.notes : undefined }
				])
			);
		});
		if ('BroadcastChannel' in window) {
			channel = new SpeakerChannel(channelName);
			channel.onmessage = (message) => {
				if (message.type === 'state') presentation = message.state;
			};
			send({ type: 'hello' });
		}
		timer = setInterval(() => elapsed++, 1000);
		return () => {
			cancelled = true;
			channel?.close();
			channel = null;
			if (timer) clearInterval(timer);
		};
	});

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') send({ type: 'next' });
		if (event.key === 'ArrowLeft') send({ type: 'prev' });
	}
</script>

<svelte:window {onkeydown} />

<div class="flex h-dvh flex-col bg-background text-foreground">
	<header class="flex items-center gap-4 border-b border-zinc-800 px-5 py-3">
		<div class="text-lg font-bold">🎙️ Speaker view</div>

		<div class="flex items-center gap-1.5">
			<span class="text-sm text-gray-500">Scene</span>
			<span class="text-sm font-semibold tabular-nums">
				{presentation ? `${presentation.sceneIndex + 1} / ${presentation.totalScenes}` : '– / –'}
			</span>
		</div>

		<div class="flex items-center gap-1.5">
			<span class="text-sm text-gray-500">Step</span>
			<span class="text-sm font-semibold tabular-nums">
				{#if presentation}
					{presentation.finished
						? `done (${presentation.totalSteps})`
						: `${presentation.step + 1} / ${presentation.totalSteps}`}
				{:else}–{/if}
			</span>
		</div>

		<div class="ml-auto flex items-center gap-3">
			<span class="text-2xl font-bold tabular-nums">{formatTime(elapsed)}</span>
			<button
				class="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-gray-400 hover:text-foreground"
				onclick={() => (elapsed = 0)}
			>
				Reset timer
			</button>
			<button
				class="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-gray-400 hover:text-foreground"
				aria-label="Toggle fullscreen"
				onclick={toggleFullscreen}
			>
				⛶
			</button>
			<button
				class="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-gray-400 hover:text-foreground"
				aria-label="Previous"
				onclick={() => send({ type: 'prev' })}
			>
				←
			</button>
			<button
				class="rounded-lg border border-accent bg-accent px-4 py-1.5 text-sm font-semibold text-background"
				aria-label="Next"
				onclick={() => send({ type: 'next' })}
			>
				Next →
			</button>
		</div>
	</header>

	{#if presentation}
		<main class="flex min-h-0 flex-1 gap-5 p-5">
			<div class="flex min-w-0 flex-1 flex-col gap-5">
				<div class="stage min-h-0 flex-1" style:--ratio={ratio}>
					<div class="fit">
						{#key `${presentation.sceneId}:${presentation.step}:${presentation.finished}`}
							<SlidePreview
								id={presentation.sceneId}
								step={presentation.step}
								finished={presentation.finished}
								{sequence}
							/>
						{/key}
					</div>
				</div>

				{#if nextId}
					<div class="flex items-center justify-center gap-3 pb-1">
						<span class="text-sm font-medium text-gray-500">Next: {nextId}</span>
						<div class="w-72">
							{#key nextId}
								<SlidePreview id={nextId} step={0} finished={false} {sequence} />
							{/key}
						</div>
					</div>
				{/if}
			</div>

			<aside
				class="flex w-96 shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-surface"
			>
				<div class="border-b border-zinc-800 px-4 py-2.5 text-sm font-semibold text-gray-400">
					Notes
				</div>
				<div
					class="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-lg leading-relaxed whitespace-pre-wrap"
				>
					{#if notes}
						{@render notes?.()}
					{:else}
						<span class="text-gray-500">No notes for this scene.</span>
					{/if}
				</div>
			</aside>
		</main>

		<footer class="border-t border-zinc-800 px-5 py-3">
			<div class="flex gap-2 overflow-x-auto">
				{#each presentation.scenes as scene, i (scene.id)}
					<button
						class="flex shrink-0 items-center gap-2 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm transition-colors {presentation.sceneId ===
						scene.id
							? 'border-accent bg-accent text-background'
							: 'text-gray-400 hover:text-foreground'}"
						onclick={() => send({ type: 'goto', id: scene.id })}
					>
						<span class="font-mono text-xs opacity-70">{i + 1}</span>
						<span class="font-medium">{scene.id}</span>
					</button>
				{/each}
			</div>
		</footer>
	{:else}
		<main class="flex flex-1 items-center justify-center">
			<p class="text-gray-500">
				Open the presentation and press <kbd class="text-foreground">s</kbd> to connect.
			</p>
		</main>
	{/if}
</div>

<style>
	.stage {
		/* A size container so `.fit` can size itself against the stage's
		   height while preserving the slide's aspect ratio. */
		container-type: size;
		display: grid;
		place-items: center;
	}

	.fit {
		width: min(100%, calc(100cqh * var(--ratio)));
		aspect-ratio: var(--ratio);
	}
</style>
