<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';

	import { SPEAKER_CHANNEL, SpeakerChannel } from './channel';

	import type { SpeakerMessage, SpeakerState } from './channel';

	interface Props {
		/** The `BroadcastChannel` name shared with the presentation window. */
		channel?: string;
	}

	let { channel: channelName = SPEAKER_CHANNEL }: Props = $props();

	const channelSupported = typeof BroadcastChannel !== 'undefined';

	let presentation = $state<SpeakerState | null>(null);
	let elapsed = $state(0);

	let channel: SpeakerChannel | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;
	let startedAt: number | null = null;

	const ratio = $derived(
		presentation ? presentation.aspectRatio.width / presentation.aspectRatio.height : 16 / 9
	);
	const mirrorSrc = $derived(`${resolve('/')}?embed=1&channel=${encodeURIComponent(channelName)}`);
	// Notes are authored by the deck author in a hidden `[data-notes]` box and
	// forwarded with the state broadcast, so rich HTML (bold, links, code)
	// survives across windows without the speaker importing scene modules.
	const notes = $derived(presentation?.notes ?? '');

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

	function resetTimer() {
		startedAt = Date.now();
		elapsed = 0;
	}

	onMount(() => {
		if (channelSupported) {
			channel = new SpeakerChannel(channelName);
			channel.onmessage = (message) => {
				if (message.type === 'state') {
					presentation = message.state;
					if (startedAt === null) startedAt = Date.now();
				}
			};
			send({ type: 'hello' });
		}
		timer = setInterval(() => {
			if (startedAt !== null) elapsed = Math.floor((Date.now() - startedAt) / 1000);
		}, 1000);
		return () => {
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
				onclick={resetTimer}
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
						<iframe
							class="h-full w-full border-0 bg-background"
							title="Presentation mirror"
							src={mirrorSrc}
						></iframe>
					</div>
				</div>
			</div>

			<aside
				class="flex w-96 shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-surface"
			>
				<div class="border-b border-zinc-800 px-4 py-2.5 text-sm font-semibold text-gray-400">
					Notes
				</div>
				<div class="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-lg leading-relaxed">
					{#if notes}
						<!-- Notes are authored by the deck author, same trust as the
						     scene markup itself, and forwarded over the speaker
						     channel rather than untrusted user input. -->
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html notes}
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
			{#if channelSupported}
				<p class="text-gray-500">
					Open the presentation and press <kbd class="text-foreground">s</kbd> to connect.
				</p>
			{:else}
				<p class="text-gray-500">BroadcastChannel is not supported in this browser.</p>
			{/if}
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
