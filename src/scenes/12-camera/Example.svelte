<script lang="ts">
	import { Camera, createScene, easeInOutCubic, Code, code } from '#lib/scene';

	const CODE = `<script>
  const scene = createScene({ camera: { zoom: 1 } })
    .frame('circle', { zoom: 1.4 })
    .frame('square', { zoom: 1.4 });
<\/script>

<Camera {scene}>
  <div data-frame="circle">Circle</div>
  <div data-frame="square">Square</div>
</Camera>`;

	const scene = createScene({ code: CODE, language: 'svelte', camera: { zoom: 1, x: 0, y: 66 } })
		.noTransition()
		.wait(1)
		.codeSelection(code.lines(7, 10), 0.4)
		.wait(1)
		.codeSelection(code.lines(2, 4), 0.4)
		.wait(1)
		.all((s) =>
			s.frame('circle', { zoom: 1.4, ease: easeInOutCubic }).codeSelection(code.lines(3), 0.4)
		)
		.wait(1)
		.all((s) =>
			s.frame('square', { zoom: 1.4, ease: easeInOutCubic }).codeSelection(code.lines(4), 0.4)
		)
		.wait(0.5)
		.all((s) =>
			s.frame({ x: 0, y: 66 }, { zoom: 1, ease: easeInOutCubic }).codeSelection(code.ALL_LINES, 0.4)
		)
		.wait(1);
</script>

<div class="relative h-full w-full overflow-hidden bg-zinc-950">
	<Camera {scene}>
		<div
			class="absolute"
			style:left="-6000px"
			style:top="-4000px"
			style:width="12000px"
			style:height="8000px"
			style:background-image="linear-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.06) 1px, transparent 1px)"
			style:background-size="100px 100px"
		></div>

		<div
			data-frame="circle"
			class="absolute flex flex-col items-center"
			style:left="-500px"
			style:top="-300px"
			style:width="400px"
			style:height="600px"
		>
			<div class="h-48 w-48 rounded-full bg-rose-500 shadow-lg"></div>
			<p class="mt-6 text-3xl font-bold text-white">Circle</p>
		</div>

		<div
			data-frame="square"
			class="absolute flex flex-col items-center"
			style:left="100px"
			style:top="-300px"
			style:width="400px"
			style:height="600px"
		>
			<div class="h-48 w-48 rounded-none bg-sky-500 shadow-lg"></div>
			<p class="mt-6 text-3xl font-bold text-white">Square</p>
		</div>
	</Camera>

	<div
		class="absolute inset-x-0 bottom-0 flex h-1/2 items-center justify-center bg-black/60 backdrop-blur"
	>
		<Code class="text-4xl leading-tight" />
	</div>
</div>
