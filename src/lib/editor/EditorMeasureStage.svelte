<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { SceneManager, type SceneTimeline } from '../scene/runtime/runtime.svelte.js';
	import { setSceneId, setSceneManager } from '../scene/runtime/context.svelte.js';
	import Scene from '../components/Scene.svelte';
	import type { SceneEntry } from '../scene/runtime/sequence.js';

	interface Props {
		/** The scene to mount for measurement only. */
		entry: SceneEntry;
		/** Receives the scene's timing and chapter title once it has loaded. */
		onmeasured: (id: string, timeline: SceneTimeline, chapter: string) => void;
	}

	let { entry, onmeasured }: Props = $props();

	let host = $state<HTMLDivElement | null>(null);

	/*
	 * The chapter label is authored in the scene as a hidden `[data-chapter]`
	 * block, the same way notes are, so a scene never has to name itself in
	 * code. It is read from this stage's own subtree, which is the scene that
	 * is mounted right now.
	 */
	function readChapter(): string {
		const text = host?.querySelector('[data-chapter]')?.textContent ?? '';
		return text.trim();
	}

	/*
	 * The manager owns the scene only long enough to read its timing, then the
	 * stage is unmounted, so a measured scene never stays alive. Render mode
	 * keeps the scheduler deterministic and stops any frame loop, which is why
	 * a hidden scene costs nothing while it is up.
	 */
	const manager = new SceneManager();
	untrack(() => {
		setSceneManager(manager);
		setSceneId(() => entry.id);
	});
	manager.enableRenderMode();

	const unsubscribe = manager.onLoad(() => onmeasured(entry.id, manager.timeline, readChapter()));

	onDestroy(() => {
		unsubscribe();
		manager.clear();
	});
</script>

<!--
	A scene only registers its steps and transitions when its component
	mounts, so this has to stay in the document. It sits off screen instead of
	being hidden with `display`, because a hidden subtree may never run the
	layout a step needs to measure itself.
-->
<div
	bind:this={host}
	aria-hidden="true"
	class="pointer-events-none fixed top-0 left-[-10000px] h-px w-px overflow-hidden"
>
	{#await entry.component() then { default: Content }}
		<Scene ratio={1} fit="contain"><Content /></Scene>
	{/await}
</div>
