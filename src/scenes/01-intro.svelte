<script lang="ts">
	import { createScene, easeInOut } from '#lib/scene';

	const scene = createScene({ opacity: 0, view: 'title' })
		.tween('opacity', 1, 0.6)
		.layout(() => (scene.view = 'circle'), 0.6, easeInOut, { enter: 'scale' });
</script>

<div class="grid place-items-center gap-16">
	<p data-layout="title" class="text-6xl font-bold" style:opacity={scene.opacity}>🪄 Animotion</p>

	{#if scene.view === 'circle'}
		<div data-layout="circle" class="h-48 w-48 rounded-full bg-amber-400"></div>
	{/if}
</div>
