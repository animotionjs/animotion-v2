<script lang="ts">
	import { createScene, easeInOutCubic } from '#lib/scene';

	const scene = createScene({ view: 'before' })
		.layout((s) => (s.view = 'after'), 1, { ease: easeInOutCubic })
		.layout((s) => (s.view = 'before'), 1, { ease: easeInOutCubic });
</script>

{#if scene.view === 'before'}
	<div data-layout="box" class="rounded-2xl bg-amber-400 p-8 text-black">
		<p data-layout="title" class="text-xl">Title</p>
		<p data-layout="subtitle" class="text-xl">Subtitle</p>
	</div>
{/if}

{#if scene.view === 'after'}
	<div data-layout="box" class="w-200 rounded-2xl bg-amber-400 p-8 text-black">
		<div class="flex items-center justify-between">
			<p data-layout="title" class="text-6xl">Title</p>
			<p data-layout="subtitle" class="text-xl">Subtitle</p>
		</div>
		<div data-layout="border" class="my-4 border-b"></div>
		<p data-layout="paragraph" class="text-2xl">
			Lorem ipsum dolor sit, amet consectetur adipisicing elit. Hic exercitationem et blanditiis
			explicabo provident doloribus, quo aliquam alias est animi vitae, quae quia? Perferendis eius
			fugit cumque vitae odit debitis.
		</p>
	</div>
{/if}
