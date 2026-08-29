<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { SceneManager } from '../scene/runtime/runtime.svelte.js';
	import { setSceneId, setSceneManager } from '../scene/runtime/context.svelte.js';
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

	onDestroy(() => {
		active.destroy();
		manager.clear();
	});

	function onkeydown(event: KeyboardEvent) {
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			(target.closest('input, select, textarea') || target.isContentEditable)
		)
			return;
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

<svelte:window {onkeydown} />

<div class="flex min-h-0 flex-1 flex-col">
	<main class="flex min-h-0 flex-1 items-center justify-center">
		<Monitor {ratio}>
			{@render children()}
		</Monitor>
	</main>

	<footer class="border-t border-foreground/10 ui-chrome">
		<Transport controller={active} />
		<Track controller={active} />
	</footer>
</div>
