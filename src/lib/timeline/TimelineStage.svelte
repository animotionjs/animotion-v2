<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { AudioController } from '../scene/audio/controller.js';
	import { SceneManager } from '../scene/runtime/runtime.svelte.js';
	import { setSceneId, setSceneManager } from '../scene/runtime/context.svelte.js';
	import { VoiceoverAudioController } from '../voiceover/controller.js';
	import { VoiceoverStore } from '../voiceover/store.js';
	import { VoiceoverRecorder, type VoiceoverRecorderState } from '../voiceover/recorder.js';
	import { voiceoverEnd, type VoiceoverClip } from '../voiceover/types.js';
	import Monitor from './Monitor.svelte';
	import Transport from './Transport.svelte';
	import Track from './Track.svelte';
	import { TimelineController } from './timeline.svelte.js';
	import type { Snippet } from 'svelte';

	interface Props {
		sceneId: string;
		fps: number;
		ratio: number;
		children: Snippet;
	}

	let { sceneId, fps, ratio, children }: Props = $props();

	/**
	 * Every scene gets its own manager so they stay fully isolated. One scene
	 * can't inherit another's progress or transitions.
	 */
	const manager = new SceneManager();
	setSceneManager(manager);
	setSceneId(() => sceneId);

	/*
	 * Playback runs on video timing, so the manager stays in render mode and
	 * every frame advances deterministically.
	 */
	manager.enableRenderMode();

	/*
	 * Transport and Track live here rather than in the shell so they all hold
	 * the same controller. One lifted above would arrive at each sibling at a
	 * different moment during the async scene load. The stage is keyed per
	 * scene and fps so neither can change while it exists, which lets us
	 * untrack it.
	 */
	const active = new TimelineController(
		manager,
		untrack(() => fps)
	);
	const voiceoverStore = new VoiceoverStore(
		untrack(() => sceneId),
		untrack(() => fps)
	);
	let alive = true;
	let recordingRequest = 0;

	let audio: AudioController | null = null;
	let voiceoverAudio: VoiceoverAudioController | null = null;
	let audioUnlocked = false;
	let voiceovers = $state<VoiceoverClip[]>([]);
	let selectedVoiceoverId = $state<string | null>(null);
	let recordingState = $state<VoiceoverRecorderState>('idle');
	let recordingElapsed = $state(0);
	let voiceoverError = $state<string | null>(null);
	let voiceoverBusy = $state(false);
	let voiceoverLoaded = $state(false);
	let recordingStart = 0;
	let recordingStartedAt = 0;
	let recordingTimer: ReturnType<typeof setInterval> | null = null;
	const recorder = new VoiceoverRecorder(handleRecorderError);

	const unsubscribeVoiceovers = voiceoverStore.subscribe((clips) => {
		voiceovers = [...clips];
		loadVoiceoverAudio();
	});

	const syncLoad = manager.onLoad(() => {
		loadAudio();
	});

	const syncPlayback = active.onPlaybackChange((time, playing) => {
		syncAudio(time, playing);
	});

	onMount(() => {
		const controller = new AudioController();
		audio = controller;
		voiceoverAudio = new VoiceoverAudioController();
		voiceoverLoaded = false;
		loadAudio();
		void voiceoverStore
			.load()
			.catch((error: unknown) => {
				voiceoverError = messageOf(error);
			})
			.finally(() => {
				if (!alive) return;
				voiceoverLoaded = true;
				loadAudio();
			});
		controller.sync(active.time, active.playing, active.speed);
	});

	onDestroy(() => {
		alive = false;
		recordingRequest++;
		syncLoad();
		syncPlayback();
		unsubscribeVoiceovers();
		if (recordingTimer !== null) clearInterval(recordingTimer);
		recorder.destroy();
		const controller = audio;
		audio = null;
		controller?.destroy();
		voiceoverAudio?.destroy();
		voiceoverAudio = null;
		active.destroy();
		manager.clear();
	});

	function loadAudio() {
		const controller = audio;
		if (controller) {
			controller.stop();
			controller.load(manager.sounds, active.duration);
		}
		loadVoiceoverAudio();
	}

	function loadVoiceoverAudio() {
		voiceoverAudio?.load(voiceovers, active.duration, (clip) => voiceoverStore.sourceUrl(clip));
	}

	function syncAudio(time: number, playing: boolean) {
		if (active.locked) {
			audio?.pause();
			voiceoverAudio?.stop();
			return;
		}
		audio?.sync(time, playing, active.speed);
		voiceoverAudio?.sync(time, playing, active.speed);
	}

	function unlockAudio() {
		const controller = audio;
		if (!controller || active.locked) return;
		if (audioUnlocked) {
			if (active.playing) syncAudio(active.time, true);
			return;
		}
		audioUnlocked = true;
		try {
			void Promise.resolve(controller.unlock())
				.then((unlocked) => {
					if (audio !== controller) return;
					if (unlocked === false) {
						audioUnlocked = false;
						return;
					}
					if (active.playing) syncAudio(active.time, true);
				})
				.catch(() => {
					if (audio === controller) audioUnlocked = false;
				});
		} catch {
			audioUnlocked = false;
		}
	}

	function messageOf(error: unknown) {
		if (error instanceof Error) return error.message;
		if (typeof error === 'object' && error !== null) {
			const body = (error as { body?: { message?: unknown } }).body;
			if (body && typeof body.message === 'string') return body.message;
			const message = (error as { message?: unknown }).message;
			if (typeof message === 'string') return message;
		}
		return String(error);
	}

	function handleRecorderError(error: Error) {
		if (!alive) return;
		if (recordingTimer !== null) clearInterval(recordingTimer);
		recordingTimer = null;
		recordingState = 'idle';
		recordingElapsed = 0;
		voiceoverBusy = false;
		voiceoverError = messageOf(error);
		active.lock(false);
	}

	function startRecording() {
		if (
			!voiceoverLoaded ||
			active.duration <= 0 ||
			active.time >= active.duration - 1e-6 ||
			recordingState !== 'idle' ||
			voiceoverBusy
		)
			return;
		if (voiceovers.some((clip) => active.time >= clip.start && active.time < voiceoverEnd(clip))) {
			voiceoverError = 'Move the playhead to an empty part of the voiceover track.';
			return;
		}

		active.pause();
		active.lock(true);
		audio?.stop();
		voiceoverAudio?.stop();
		voiceoverError = null;
		recordingStart = active.time;
		recordingStartedAt = performance.now();
		recordingState = 'requesting';
		const request = ++recordingRequest;
		void recorder
			.start()
			.then(() => {
				if (!alive || request !== recordingRequest || !active.locked) {
					recorder.cancel();
					return;
				}
				recordingState = 'recording';
				recordingElapsed = 0;
				recordingTimer = setInterval(() => {
					recordingElapsed = (performance.now() - recordingStartedAt) / 1000;
				}, 100);
			})
			.catch((error: unknown) => {
				if (!alive || request !== recordingRequest) return;
				recordingState = 'idle';
				voiceoverError = messageOf(error);
				active.lock(false);
			});
	}

	function stopRecording() {
		if (recordingState !== 'recording') return;
		const request = recordingRequest;
		if (recordingTimer !== null) clearInterval(recordingTimer);
		recordingTimer = null;
		recordingState = 'stopping';
		void recorder
			.stop()
			.then(async (recording) => {
				if (!alive || request !== recordingRequest) return;
				if (recording.duration <= 0) throw new Error('The recording was too short to save.');
				if (recordingStart + recording.duration > active.duration + 1e-6) {
					throw new Error('The recording is longer than the remaining scene timeline.');
				}
				voiceoverBusy = true;
				const clip = await voiceoverStore.add(recording, recordingStart);
				selectedVoiceoverId = clip.id;
			})
			.catch((error: unknown) => {
				if (!alive || request !== recordingRequest) return;
				voiceoverError = messageOf(error);
			})
			.finally(() => {
				if (!alive || request !== recordingRequest) return;
				recordingState = 'idle';
				recordingElapsed = 0;
				voiceoverBusy = false;
				active.lock(false);
			});
	}

	function moveVoiceover(id: string, start: number) {
		if (voiceoverBusy || active.locked) return;
		voiceoverBusy = true;
		voiceoverError = null;
		void voiceoverStore
			.move(id, start)
			.catch((error: unknown) => {
				if (!alive) return;
				voiceoverError = messageOf(error);
			})
			.finally(() => {
				if (alive) voiceoverBusy = false;
			});
	}

	function selectVoiceover(id: string) {
		selectedVoiceoverId = id;
		const clip = voiceovers.find((item) => item.id === id);
		if (clip) active.seekTo(clip.start);
	}

	function removeVoiceover(id: string) {
		if (voiceoverBusy || active.locked) return;
		voiceoverBusy = true;
		voiceoverError = null;
		void voiceoverStore
			.remove(id)
			.then(() => {
				if (alive && selectedVoiceoverId === id) selectedVoiceoverId = null;
			})
			.catch((error: unknown) => {
				if (!alive) return;
				voiceoverError = messageOf(error);
			})
			.finally(() => {
				if (alive) voiceoverBusy = false;
			});
	}

	function onkeydown(event: KeyboardEvent) {
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			(target.closest('input, select, textarea, button') || target.isContentEditable)
		)
			return;
		if (
			selectedVoiceoverId !== null &&
			(event.key === 'Delete' || event.key === 'Backspace') &&
			!active.locked
		) {
			event.preventDefault();
			removeVoiceover(selectedVoiceoverId);
			return;
		}
		unlockAudio();
		// held toggle keys would flip on every repeat, so only stepping keys repeat
		if (event.repeat && (event.key === ' ' || event.key === 'l' || event.key === 'L')) return;
		const timeline = active;
		switch (event.key) {
			case ' ':
				event.preventDefault();
				timeline.toggle();
				break;
			case 'ArrowLeft':
				event.preventDefault();
				timeline.jumpPrev();
				break;
			case 'ArrowRight':
				event.preventDefault();
				timeline.jumpNext();
				break;
			case ',':
				timeline.nudge(-1);
				break;
			case '.':
				timeline.nudge(1);
				break;
			case 'Home':
				event.preventDefault();
				timeline.seekTo(0);
				break;
			case 'End':
				event.preventDefault();
				timeline.seekTo(timeline.duration);
				break;
			case 'l':
			case 'L':
				if (!event.metaKey && !event.ctrlKey && !event.altKey) timeline.loop = !timeline.loop;
				break;
		}
	}
</script>

<svelte:window {onkeydown} onpointerdown={unlockAudio} onclick={unlockAudio} />

<div class="flex min-h-0 flex-1 flex-col">
	<main class="flex min-h-0 flex-1 items-center justify-center">
		<Monitor {ratio}>
			{@render children()}
		</Monitor>
	</main>

	<footer class="border-t border-foreground/10 ui-chrome">
		<Transport
			controller={active}
			{recordingState}
			{recordingElapsed}
			{voiceoverBusy}
			canRecord={voiceoverLoaded && active.duration > 0 && active.time < active.duration - 1e-6}
			onrecord={startRecording}
			onstoprecording={stopRecording}
		/>
		<Track
			controller={active}
			{voiceovers}
			{selectedVoiceoverId}
			{voiceoverError}
			{voiceoverBusy}
			disabled={active.locked}
			onselectvoiceover={selectVoiceover}
			onmovevoiceover={moveVoiceover}
			oninvalidvoiceover={() => (voiceoverError = 'Voiceover recordings cannot overlap.')}
			ondeletevoiceover={removeVoiceover}
		/>
	</footer>
</div>
