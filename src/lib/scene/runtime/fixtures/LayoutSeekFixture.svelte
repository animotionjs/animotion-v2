<script module lang="ts">
	import { SceneManager } from '../runtime.svelte.js';
	export const manager = new SceneManager();
</script>

<script lang="ts">
	import { createScene } from '../builder.svelte.js';
	import { easeInOut } from '../../easing.js';
	import { setSceneManager, setSceneId } from '../context.svelte.js';

	setSceneManager(manager);
	setSceneId(() => 'layout-seek-test');

	const scene = createScene({ opacity: 0, view: 'title' })
		.tween('opacity', 1, 0.6)
		.layout((s) => (s.view = 'logo'), 0.6, { ease: easeInOut, enter: 'scale' });
</script>

<div class="text-4xl font-bold">
	{#if scene.view === 'logo'}
		<span data-layout="badge">wand</span>
	{/if}
	<span data-layout="title" style:opacity={scene.opacity}>Animotion</span>
</div>
