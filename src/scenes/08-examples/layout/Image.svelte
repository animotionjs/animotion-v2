<script lang="ts">
	import { createScene, easeInOutCubic } from '#lib/scene';
	import painting from '../assets/painting.jpg';

	const scene = createScene({ view: 'before' })
		.layout((s) => (s.view = 'after'), 1, { ease: easeInOutCubic })
		.layout((s) => (s.view = 'before'), 1, { ease: easeInOutCubic });
</script>

{#if scene.view === 'before'}
	<div data-layout="container" class="relative w-240 overflow-hidden rounded-2xl bg-amber-400 p-1">
		<img data-layout="painting" class="w-full rounded-2xl" src={painting} alt="The Backwater" />
		<p data-layout="title" class="absolute bottom-6 left-6 text-4xl text-white">The Backwater</p>
	</div>
{/if}

{#if scene.view === 'after'}
	<div
		data-layout="container"
		class="w-180 overflow-hidden rounded-2xl bg-amber-400 p-4 text-black"
	>
		<img data-layout="painting" class="w-full rounded-2xl" src={painting} alt="The Backwater" />
		<div class="px-4 py-8">
			<p data-layout="title" class="text-6xl text-black">The Backwater</p>
			<div data-layout="border" class="my-8 border-b"></div>
			<p data-layout="description" class="text-2xl">
				“The Backwater” is an oil painting created in 1903 by British artist Charles William Wyllie
				(1853–1923). It depicts a tranquil, idyllic river scene with a woman on the bank and a man
				in a boat. Several other famous backwater-themed paintings also exist by artists like John
				Singer Sargent.
			</p>
		</div>
	</div>
{/if}
