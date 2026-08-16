<script lang="ts">
	import { createScene, easeInOutCubic } from '#lib/scene';

	const scene = createScene({ view: 'before' })
		.layout((s) => (s.view = 'after'), 1, { ease: easeInOutCubic })
		.layout((s) => (s.view = 'before'), 1, { ease: easeInOutCubic });
</script>

{#if scene.view === 'before'}
	<div
		data-layout="box"
		class="grid h-50 w-50 -translate-x-100 rotate-180 place-content-center border-8 border-red-600 bg-amber-400"
	></div>
{/if}

{#if scene.view === 'after'}
	<div
		data-layout="box"
		class="h-50 w-50 translate-x-100 rounded-full border-8 border-amber-400 bg-red-600"
	></div>
{/if}
