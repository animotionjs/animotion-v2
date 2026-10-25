<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { AudioPlayer } from './audio.js';
	import { CanvasRenderer } from './renderer.js';
	import { CanvasSceneManager } from './ui.js';
	import type { SceneEntry } from '../scene/runtime/sequence.js';
	import type { EditorController } from '../editor/controller.svelte.js';
	import type { UiTimeline } from './ui.js';

	interface Props {
		entry: SceneEntry;
		controller: EditorController;
		active: boolean;
		onmeasured: (id: string, timeline: UiTimeline, chapter: string) => void;
	}

	let { entry, controller, active, onmeasured }: Props = $props();

	const definition = untrack(() => entry.definition);
	if (!definition) {
		throw new Error(`Scene "${untrack(() => entry.id)}" has no canvas definition.`);
	}

	const instance = definition.create();
	const sceneWidth = untrack(() => entry.width ?? 1920);
	const manager = new CanvasSceneManager(instance, sceneWidth, definition.transition);
	const timeline = manager.timeline;

	let canvas: HTMLCanvasElement | undefined;

	onMount(() => {
		if (!canvas) return;

		const renderer = new CanvasRenderer(canvas, instance, {
			width: entry.width ?? 1920,
			height: entry.height ?? 1080,
			background: null
		});

		const audio = new AudioPlayer();
		audio.load(instance.audio);

		manager.setRenderer((time, transition, playing) => {
			renderer.begin();
			renderer.drawScene(instance, time, transition);
			renderer.end();
			audio.sync(time, playing);
		});
		instance.setInvalidate(() => manager.redraw());
		onmeasured(entry.id, timeline, entry.chapter ?? '');
		controller.attach(entry.id, manager);

		const observer = new ResizeObserver(() => {
			renderer.resize();
			manager.redraw();
		});
		observer.observe(canvas);

		return () => {
			observer.disconnect();
			controller.detach(entry.id);
			manager.clear();
			instance.setInvalidate(null);
			audio.stop();
		};
	});

	onDestroy(() => manager.clear());
</script>

<div
	class="absolute inset-0 flex items-center justify-center"
	data-editor-scene
	data-active={active ? '' : undefined}
>
	<canvas bind:this={canvas} class="block h-full w-full"></canvas>
</div>
