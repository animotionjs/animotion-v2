<script module lang="ts">
	import type { SceneTransitionConfig } from '#lib/slides/transitions.js';

	export const transition: SceneTransitionConfig = { enter: 'slide', exit: 'fade', duration: 500 };
</script>

<script lang="ts">
	import { getSlide } from '#lib/slides/context.svelte.js';

	const slide = getSlide();
</script>

<div
	class={['flex h-full flex-col gap-6 p-12', slide.step >= 1 ? 'justify-start' : 'justify-center']}
>
	<div class="flex w-full items-end justify-between gap-8">
		<h1 data-layout="title" class="text-7xl font-bold">Layout</h1>
		<p data-layout="step-label" class="text-2xl text-white/40">step {slide.step + 1}</p>
	</div>

	<div class="grid w-full grid-cols-3 gap-6">
		<div
			data-layout="card-a"
			class={[
				'grid place-items-center rounded-3xl bg-accent text-black',
				slide.step >= 2 ? 'col-span-2 row-span-2 min-h-60' : 'min-h-40'
			]}
		>
			<span class="text-6xl font-bold">1</span>
		</div>

		<div data-layout="card-b" class="grid min-h-40 place-items-center rounded-3xl bg-white/10">
			<span class="text-6xl font-bold">2</span>
		</div>

		<div data-layout="card-c" class="grid min-h-40 place-items-center rounded-3xl bg-white/10">
			<span class="text-6xl font-bold">3</span>
		</div>

		<div
			data-step="1"
			data-layout="detail"
			class="col-span-3 rounded-3xl border border-white/10 p-5"
		>
			<p class="text-2xl text-white/70">A new panel appears and the cards move up.</p>
		</div>

		<div data-step="2" data-layout="note" class="col-span-3 rounded-3xl bg-white/5 p-5">
			<p class="text-2xl text-white/70">The first card grows while the others shift around it.</p>
		</div>
	</div>
</div>

<div data-notes>
	The cards use data-layout keys. The engine compares their boxes and animates the difference.
</div>
