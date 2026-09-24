<script lang="ts">
	import { createScene, easeInOut } from '#lib/scene';

	const scene = createScene({ opacity: 0, view: 'title' })
		.tween('opacity', 1, 0.6)
		.sound('chime', { duration: 0.8, fadeIn: 0.2, fadeOut: 0.4, volume: 0.4 })
		.layout((s) => (s.view = 'logo'), 0.6, { ease: easeInOut, enter: 'scale' });
</script>

<div data-notes>
	Welcome to Animotion, a Svelte engine for building animated presentations. Press the right arrow
	to move through the steps.
</div>

<div class="text-6xl font-bold">
	{#if scene.view === 'logo'}
		<span data-layout="logo">🪄</span>
	{/if}
	<span data-layout="title" style:opacity={scene.opacity}>Animotion</span>
</div>
