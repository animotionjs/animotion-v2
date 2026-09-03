<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { SceneManager } from '../scene/runtime/runtime.svelte.js';
	import { setSceneId, setSceneManager } from '../scene/runtime/context.svelte.js';
	import { getOptions } from '../scene/index.js';
	import { TimelineController } from '../timeline/timeline.svelte.js';
	import { ASPECT_RATIOS, type AspectRatio } from '../scene/options.js';
	import Stage from './Scene.svelte';
	import type { Component } from 'svelte';

	interface Props {
		/** The scene component to play. */
		scene: Component;
		/** Frames per second for frame stepping, defaults to the configured render fps. */
		fps?: number;
		/** Aspect preset override, defaults to the configured aspect ratio. */
		aspect?: AspectRatio;
		/** Restarts the scene from the start whenever it reaches the end. */
		loop?: boolean;
		/** Starts playing as soon as the scene has loaded. */
		autoplay?: boolean;
		/** Play and step with space comma period, off so the host page keeps its keys. */
		keyboard?: boolean;
		/** Class on the player root, for scoping theme overrides. */
		class?: string;
	}

	let {
		scene,
		fps,
		aspect,
		loop = false,
		autoplay = false,
		keyboard = false,
		class: className = ''
	}: Props = $props();

	/*
	 * Every player owns its manager so embedded scenes stay isolated, and
	 * render mode keeps playback frame exact, so a paused frame is the frame
	 * the video renderer would write.
	 */
	const manager = new SceneManager();
	setSceneManager(manager);
	setSceneId(() => 'player');
	manager.enableRenderMode();

	// fps and loop are snapshots, so later parent changes are ignored
	const initialFps = untrack(() => fps ?? getOptions().render.fps);
	const initialLoop = untrack(() => loop);
	const controller = new TimelineController(manager, initialFps);
	controller.loop = initialLoop;

	onMount(() => {
		// child scenes mount first, so the scene is loaded and the duration known
		if (autoplay) controller.play();

		return () => {
			if (scrubFrame !== null) cancelAnimationFrame(scrubFrame);
			controller.destroy();
			manager.clear();
		};
	});

	const Content = $derived(scene);
	const ratio = $derived(
		aspect ? ASPECT_RATIOS[aspect].width / ASPECT_RATIOS[aspect].height : undefined
	);
	const percent = $derived(
		controller.duration > 0 ? (controller.time / controller.duration) * 100 : 0
	);
	const scrubDisabled = $derived(controller.duration <= 0);

	let scrubbing = $state(false);
	let scrubElement: HTMLElement | null = null;
	let scrubClientX = 0;
	let scrubFrame: number | null = null;

	function seekFromClientX(clientX: number, element: HTMLElement) {
		const rect = element.getBoundingClientRect();
		if (rect.width <= 0) return;
		const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
		controller.seekTo(ratio * controller.duration);
	}

	function onScrubStart(event: PointerEvent) {
		if (scrubDisabled) return;
		const element = event.currentTarget as HTMLElement;
		/*
		 * Capture retargets stray moves to the bar while the window handler
		 * owns the drag, but a failed grab must never eat the seek
		 */
		try {
			element.setPointerCapture(event.pointerId);
		} catch {
			// seeking works fine without capture
		}
		scrubElement = element;
		scrubClientX = event.clientX;
		scrubbing = true;
		seekFromClientX(event.clientX, element);
	}

	function onScrubMove(event: PointerEvent) {
		if (!scrubbing || scrubDisabled) return;
		/*
		 * Moves arrive faster than frames and every seek rebuilds the scene,
		 * so keep only the latest position and seek once per frame instead
		 */
		scrubClientX = event.clientX;
		if (scrubFrame !== null) return;
		scrubFrame = requestAnimationFrame(() => {
			scrubFrame = null;
			const element = scrubElement;
			if (!scrubbing || !element || scrubDisabled) return;
			seekFromClientX(scrubClientX, element);
		});
	}

	function endScrub(event: PointerEvent) {
		// losing capture mid drag must not end anything, only a real release does
		if (!scrubbing) return;
		scrubbing = false;
		// a queued seek would land behind the release, so drop it and seek here
		if (scrubFrame !== null) {
			cancelAnimationFrame(scrubFrame);
			scrubFrame = null;
		}
		const element = scrubElement;
		scrubElement = null;
		// the drag ends exactly where the pointer was released
		if (element && !scrubDisabled) seekFromClientX(event.clientX, element);
	}

	function onScrubKey(event: KeyboardEvent) {
		// the slider answers its own keys and the window handler leaves it alone
		switch (event.key) {
			case 'ArrowLeft':
				event.preventDefault();
				controller.nudge(-1);
				break;
			case 'ArrowRight':
				event.preventDefault();
				controller.nudge(1);
				break;
			case 'Home':
				event.preventDefault();
				controller.seekTo(0);
				break;
			case 'End':
				event.preventDefault();
				controller.seekTo(controller.duration);
				break;
			case ',':
				event.preventDefault();
				controller.nudge(-1);
				break;
			case '.':
				event.preventDefault();
				controller.nudge(1);
				break;
			case ' ':
				// a held space would flip play state on every key repeat
				if (event.repeat) return;
				event.preventDefault();
				controller.toggle();
				break;
		}
	}

	function onkeydown(event: KeyboardEvent) {
		if (!keyboard) return;
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			(target.closest('input, select, textarea, [role="slider"]') || target.isContentEditable)
		)
			return;
		// a held space would flip play state on every key repeat
		if (event.repeat && event.key === ' ') return;
		switch (event.key) {
			case ' ':
				// a focused button already toggles on click, so skip the double
				if (target instanceof HTMLElement && target.closest('button')) return;
				event.preventDefault();
				controller.toggle();
				break;
			case ',':
				controller.nudge(-1);
				break;
			case '.':
				controller.nudge(1);
				break;
		}
	}
</script>

<svelte:window
	{onkeydown}
	onpointermove={onScrubMove}
	onpointerup={endScrub}
	onpointercancel={endScrub}
/>

<div class="ui-player flex w-full flex-col items-center {className}">
	<div class="w-full">
		<Stage fit="contain" {ratio}>
			<Content />
		</Stage>
	</div>

	<div class="flex w-full items-center gap-2 py-2">
		<button
			type="button"
			class="grid size-6 place-items-center rounded-full bg-transparent text-(--player-icon) transition-colors hover:bg-(--player-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--player-accent)"
			aria-label={controller.playing ? 'Pause' : 'Play'}
			title={controller.playing ? 'Pause' : 'Play'}
			onclick={() => controller.toggle()}
		>
			{#if controller.playing}
				<svg viewBox="0 0 18 16" class="h-5 w-5 fill-current" aria-hidden="true">
					<path d="M5 3h2.5v10H5zM10.5 3H13v10h-2.5z" />
				</svg>
			{:else}
				<svg viewBox="0 0 18 16" class="h-5 w-5 fill-current" aria-hidden="true">
					<path d="M5 3l9 5-9 5z" />
				</svg>
			{/if}
		</button>

		<div
			role="slider"
			tabindex={scrubDisabled ? -1 : 0}
			class="group relative flex h-10 flex-1 cursor-pointer touch-none items-center rounded-full outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--player-accent) data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40"
			data-scrubbing={scrubbing}
			data-disabled={scrubDisabled}
			aria-label="Scene playhead"
			aria-valuemin={0}
			aria-valuemax={controller.duration}
			aria-valuenow={controller.time}
			aria-valuetext={`${controller.time.toFixed(2)} of ${controller.duration.toFixed(2)} seconds`}
			aria-disabled={scrubDisabled}
			onpointerdown={onScrubStart}
			onkeydown={onScrubKey}
		>
			<div
				class="relative h-1 w-full overflow-hidden rounded-full bg-(--player-track)"
				aria-hidden="true"
			>
				<div
					class="absolute inset-y-0 inset-s-0 rounded-full bg-(--player-accent)"
					style:width="{percent}%"
				></div>
			</div>
			<div
				class="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--player-accent) opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[scrubbing=true]:opacity-100"
				style:left="{percent}%"
				aria-hidden="true"
			></div>
		</div>
	</div>
</div>
