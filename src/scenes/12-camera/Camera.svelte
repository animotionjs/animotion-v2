<script lang="ts">
	import { Camera, createScene } from '#lib/scene';

	const scene = createScene({ camera: { zoom: 1.4 } })
		.frame('pan', { zoom: 1.4 })
		.wait(1)
		.frame('zoom', { zoom: 1.8 })
		.wait(1)
		.frame('rotate', { deg: 90 })
		.wait(1)
		.frame('gif', { zoom: 1.4, deg: 0 });
</script>

<Camera {scene}>
	<div
		data-frame="camera"
		class="absolute top-1/2 left-1/2 w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-amber-400 p-8 text-black"
	>
		<p class="text-5xl font-bold">The Camera</p>
		<p class="mt-4 text-2xl">Pan, zoom, rotate across a large canvas.</p>
	</div>

	<div
		data-frame="pan"
		class="absolute w-[620px] rounded-3xl bg-sky-400 p-8 text-black"
		style:left="900px"
		style:top="-200px"
	>
		<p class="text-5xl font-bold">Pan</p>
		<p class="mt-4 text-2xl">Slide the camera across the scene to reveal what's off to the side.</p>
	</div>

	<div
		data-frame="zoom"
		class="absolute w-[620px] rounded-3xl bg-emerald-400 p-8 text-black"
		style:left="-500px"
		style:top="500px"
	>
		<p class="text-5xl font-bold">Zoom</p>
		<p class="mt-4 text-2xl">
			Scale in toward a frame to focus on the details, then pull back out.
		</p>
	</div>

	<div
		data-frame="rotate"
		class="absolute w-[620px] -rotate-90 rounded-3xl bg-violet-400 p-8 text-black"
		style:left="850px"
		style:top="650px"
	>
		<p class="text-5xl font-bold">Rotate</p>
		<p class="mt-4 text-2xl">
			Spin the whole canvas. This frame is visited with the camera turned 90°.
		</p>
	</div>

	<div
		data-frame="gif"
		class="absolute w-max scale-150 overflow-hidden rounded-3xl"
		style:left="-400px"
		style:top="1000px"
	>
		<img src="https://media1.tenor.com/m/AIsACQVVdWUAAAAC/awkward-smile-nod.gif" alt="Gif" />
	</div>
</Camera>
