<script module lang="ts">
	import type { SceneTransitionConfig } from '#lib/slides/transitions.js';

	export const transition: SceneTransitionConfig = { enter: 'zoom', exit: 'fade', duration: 600 };
</script>

<script lang="ts">
	import { getSlide } from '#lib/slides/context.svelte.js';

	const slide = getSlide();
</script>

<div
	class={[
		'flex h-full flex-col gap-6 p-20',
		slide.step >= 1
			? 'items-start justify-start pt-24 text-left'
			: 'items-center justify-center text-center'
	]}
>
	<h1 data-layout="title" class="text-9xl font-bold">Slides</h1>
	<p data-layout="hint" data-step="1" class="text-3xl text-white/60">Press the right arrow</p>
	<p data-layout="note" data-step="2" class="text-2xl text-accent">Everything is markup</p>
</div>

<div data-notes>Welcome to the presentation. Press the right arrow to move through the steps.</div>
