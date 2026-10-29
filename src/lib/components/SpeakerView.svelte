<script lang="ts">
	import { onMount } from 'svelte';
	import {
		speakerChannelName,
		SpeakerSession,
		type SpeakerMessage,
		type SpeakerState
	} from '../slides/speaker.js';

	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	const channelSupported = typeof BroadcastChannel !== 'undefined';

	let presentation = $state<SpeakerState | null>(null);
	let elapsed = $state(0);

	let session: SpeakerSession | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;
	let startedAt: number | null = null;

	const base = $derived(`/presentation/${encodeURIComponent(slug)}`);
	const followSrc = $derived(`${base}?embed`);
	const notes = $derived(presentation?.notes ?? '');

	function send(message: SpeakerMessage) {
		session?.post(message);
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
			session = new SpeakerSession(speakerChannelName(slug));
			session.onmessage = (message) => {
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
			session?.close();
			session = null;
			if (timer) clearInterval(timer);
		};
	});

	function onkeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			send({ type: 'next' });
		}
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			send({ type: 'prev' });
		}
	}
</script>

<svelte:window {onkeydown} />

<div class="flex h-dvh flex-col bg-background text-foreground ui-chrome">
	<header class="flex items-center gap-4 border-b border-zinc-800 px-5 py-3">
		<div class="text-lg leading-none font-bold">Speaker view</div>

		<div class="flex items-center gap-2">
			<span class="text-sm leading-none text-zinc-500">Scene</span>
			<span class="text-sm leading-none font-semibold tabular-nums">
				{presentation ? `${presentation.sceneIndex + 1} / ${presentation.totalScenes}` : '– / –'}
			</span>
		</div>

		<div class="flex items-center gap-2">
			<span class="text-sm leading-none text-zinc-500">Step</span>
			<span class="text-sm leading-none font-semibold tabular-nums">
				{presentation ? `${presentation.step} / ${presentation.max}` : '–'}
			</span>
		</div>

		<div class="ml-auto flex items-center gap-3">
			<span class="text-2xl leading-none font-bold tabular-nums">{formatTime(elapsed)}</span>
			<button
				class="cursor-pointer rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400 transition-colors duration-100 hover:text-foreground"
				onclick={resetTimer}
			>
				Reset timer
			</button>
			<button
				class="cursor-pointer rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400 transition-colors duration-100 hover:text-foreground"
				title="Toggle fullscreen"
				aria-label="Toggle fullscreen"
				onclick={toggleFullscreen}
			>
				⛶
			</button>
			<button
				class="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400 transition-colors duration-100 hover:text-foreground"
				aria-label="Previous"
				onclick={() => send({ type: 'prev' })}
			>
				<span class="translate-y-[-0.1em] leading-none" aria-hidden="true">←</span>
				Previous
			</button>
			<button
				class="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-accent bg-accent px-4 py-2 text-sm font-semibold text-background"
				aria-label="Next"
				onclick={() => send({ type: 'next' })}
			>
				Next
				<span class="translate-y-[-0.1em] leading-none" aria-hidden="true">→</span>
			</button>
		</div>
	</header>

	{#if presentation}
		<main class="flex flex-1 gap-5 p-5">
			<div class="grid min-h-0 min-w-0 flex-1 place-items-center">
				<div
					class="aspect-video w-full max-w-5xl overflow-hidden rounded-xl border border-zinc-800"
				>
					<iframe
						class="h-full w-full border-0 bg-background"
						title="Presentation preview"
						src={followSrc}
					></iframe>
				</div>
			</div>

			<aside
				class="flex w-96 shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950"
			>
				<div class="border-b border-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-400">
					Notes
				</div>
				<div class="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-lg leading-relaxed">
					{#if notes}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html notes}
					{:else}
						<span class="text-zinc-500">No notes for this scene.</span>
					{/if}
				</div>
			</aside>
		</main>

		<footer class="border-t border-zinc-800 px-5 py-3">
			<div class="flex gap-2 overflow-x-auto">
				{#each presentation.scenes as scene, i (scene.id)}
					<button
						class="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm transition-colors duration-100 {presentation.sceneId ===
						scene.id
							? 'border-accent bg-accent text-background'
							: 'text-zinc-400 hover:text-foreground'}"
						onclick={() => send({ type: 'goto', id: scene.id })}
					>
						<span class="font-mono text-xs opacity-70">{i + 1}</span>
						<span class="font-medium">{scene.id}</span>
					</button>
				{/each}
			</div>
		</footer>
	{:else}
		<main class="flex flex-1 flex-col items-center justify-center gap-4">
			{#if channelSupported}
				<p class="text-zinc-500">Open the presentation and press s to connect.</p>
				<a
					class="rounded-lg bg-white/10 px-4 py-2 hover:bg-white/15"
					href={base}
					target="_blank"
					rel="noreferrer">Open presentation</a
				>
			{:else}
				<p class="text-zinc-500">BroadcastChannel is not supported in this browser.</p>
			{/if}
		</main>
	{/if}
</div>
