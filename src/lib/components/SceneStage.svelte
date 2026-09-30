<script lang="ts">
	import { untrack } from 'svelte';
	import { setSceneId, setSceneManager } from '../scene/runtime/context.svelte.js';
	import type { SceneManager } from '../scene/runtime/runtime.svelte.js';
	import type { SceneEntry } from '../scene/runtime/sequence.js';
	import Scene from './Scene.svelte';

	interface Props {
		/** The scene this stage mounts. */
		entry: SceneEntry;
		/** The manager that drives the mounted scene. */
		manager: SceneManager;
		/** Aspect ratio (width ÷ height) override for the scene box. */
		ratio?: number;
		/** Whether this stage is the scene on screen. */
		active?: boolean;
	}

	let { entry, manager, ratio, active = false }: Props = $props();

	/*
	 * The stage owns the context its scene reads, so every mounted scene
	 * resolves its own manager and id, even while another scene is leaving.
	 * Both are fixed for the stage's lifetime, so capturing them is correct.
	 */
	untrack(() => {
		setSceneManager(manager);
		setSceneId(() => entry.id);
	});
</script>

<div
	class="absolute inset-0 flex items-center justify-center"
	data-scene-stage
	data-active={active ? '' : undefined}
>
	{#await entry.component() then { default: Content }}
		<Scene {ratio}>
			<Content />
		</Scene>
	{/await}
</div>
