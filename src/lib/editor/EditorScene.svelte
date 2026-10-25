<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { SceneManager, type SceneTimeline } from '../scene/runtime/runtime.svelte.js';
	import { setSceneId, setSceneManager } from '../scene/runtime/context.svelte.js';
	import Scene from '../components/Scene.svelte';
	import { getComponent } from './components.svelte.js';
	import type { SceneEntry } from '../scene/runtime/sequence.js';
	import type { EditorController } from './controller.svelte.js';

	interface Props {
		/** The scene this stage mounts. */
		entry: SceneEntry;
		/** Aspect ratio of the preview box. */
		ratio: number;
		/** The clock this stage reports itself to. */
		controller: EditorController;
		/** Whether this is the scene on screen rather than the outgoing one. */
		active: boolean;
		/** Receives the scene's timing and chapter title once it has loaded. */
		onmeasured: (id: string, timeline: SceneTimeline, chapter: string) => void;
	}

	let { entry, ratio, controller, active, onmeasured }: Props = $props();

	let host = $state<HTMLDivElement | null>(null);

	/*
	 * The scene's chapter label, authored as a hidden `[data-chapter]` block.
	 * The visible preview reports it too, so a video that is never remeasured
	 * still has its chapters once it has been on screen.
	 */
	function readChapter(): string {
		const text = host?.querySelector('[data-chapter]')?.textContent ?? '';
		return text.trim();
	}

	/*
	 * The component comes from the shared cache rather than an await block, so
	 * an update to this component can never restart an import and remount the
	 * scene.
	 */
	const Content = $derived(getComponent(entry.id));

	/*
	 * The editor drives every transition from its own clock, so the automatic
	 * enter on load is turned off. The manager then only ever holds the
	 * scene's own animation, and the clock decides how far through it we are.
	 */
	const manager = new SceneManager();
	untrack(() => {
		setSceneManager(manager);
		setSceneId(() => entry.id);
	});
	manager.enableRenderMode();
	manager.suppressEnter();

	const unsubscribe = manager.onLoad(() => {
		onmeasured(entry.id, manager.timeline, readChapter());
		controller.attach(entry.id, manager);
	});

	onDestroy(() => {
		unsubscribe();
		controller.detach(entry.id);
		manager.clear();
	});
</script>

<div
	bind:this={host}
	class="absolute inset-0 flex items-center justify-center"
	data-editor-scene
	data-active={active ? '' : undefined}
>
	{#if Content}
		<Scene {ratio} fit="contain"><Content /></Scene>
	{/if}
</div>
