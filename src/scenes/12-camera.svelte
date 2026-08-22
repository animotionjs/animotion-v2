<script lang="ts">
	import { createScene, easeInOut, lerp, type SceneBuilder } from '#lib/scene';

	type Camera = { x: number; y: number; zoom: number; deg: number };
	type CameraScene = Camera & SceneBuilder<Camera>;

	let canvas: HTMLElement | undefined = $state();

	function fly(scene: CameraScene, id: string, zoom: number, deg = 0) {
		let from: Camera | null = null;
		let to: Camera | null = null;
		scene.tick(
			({ progress }) => {
				if (!to && canvas) {
					const island = canvas.querySelector(`[data-island="${id}"]`);
					const world = canvas.getBoundingClientRect();
					const r = island?.getBoundingClientRect();
					if (island && r) {
						from = { x: scene.x, y: scene.y, zoom: scene.zoom, deg: scene.deg };
						// the island's screen offset already includes the current
						// camera rotation (its `world.left` term cancels the camera
						// position), so un-rotate it to recover the world center.
						const rad = (scene.deg * Math.PI) / 180;
						const sx = ((r.left + r.right) / 2 - world.left) / scene.zoom;
						const sy = ((r.top + r.bottom) / 2 - world.top) / scene.zoom;
						to = {
							x: sx * Math.cos(rad) + sy * Math.sin(rad),
							y: -sx * Math.sin(rad) + sy * Math.cos(rad),
							zoom,
							deg
						};
					}
				}
				if (from && to) {
					scene.x = lerp(from.x, to.x, progress);
					scene.y = lerp(from.y, to.y, progress);
					scene.zoom = lerp(from.zoom, to.zoom, progress);
					scene.deg = lerp(from.deg, to.deg, progress);
				}
			},
			1.4,
			easeInOut
		);
		return scene;
	}

	const scene = createScene<Camera>({ x: 0, y: 0, zoom: 1.4, deg: 0 })
		.noTransition()
		.all((s) => fly(s, 'pan', 1.4).wait(1))
		.all((s) => fly(s, 'zoom', 1.8).wait(1))
		.all((s) => fly(s, 'rotate', 1.4, 90).wait(1))
		.all((s) => fly(s, 'gif', 1.4, 0).wait(1));

	const camera = $derived(
		`scale(${scene.zoom}) rotate(${scene.deg}deg) translate(${-scene.x}px, ${-scene.y}px)`
	);
</script>

<div class="relative h-full w-full overflow-hidden">
	<div class="absolute top-1/2 left-1/2" bind:this={canvas} style:transform={camera}>
		<div
			data-island="camera"
			class="absolute top-1/2 left-1/2 w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-amber-400 p-8 text-black"
		>
			<p class="text-5xl font-bold">The Camera</p>
			<p class="mt-4 text-2xl">Pan, zoom, rotate across a large canvas.</p>
		</div>

		<div
			data-island="pan"
			class="absolute w-[620px] rounded-3xl bg-sky-400 p-8 text-black"
			style:left="900px"
			style:top="-200px"
		>
			<p class="text-5xl font-bold">Pan</p>
			<p class="mt-4 text-2xl">
				Slide the camera across the scene to reveal what's off to the side.
			</p>
		</div>

		<div
			data-island="zoom"
			class="absolute w-[620px] rounded-3xl bg-emerald-400 p-8 text-black"
			style:left="-500px"
			style:top="500px"
		>
			<p class="text-5xl font-bold">Zoom</p>
			<p class="mt-4 text-2xl">
				Scale in toward an island to focus on the details, then pull back out.
			</p>
		</div>

		<div
			data-island="rotate"
			class="absolute w-[620px] -rotate-90 rounded-3xl bg-violet-400 p-8 text-black"
			style:left="850px"
			style:top="650px"
		>
			<p class="text-5xl font-bold">Rotate</p>
			<p class="mt-4 text-2xl">
				Spin the whole world. This island is visited with the camera turned 90°.
			</p>
		</div>

		<div
			data-island="gif"
			class="absolute w-max scale-150 overflow-hidden rounded-3xl"
			style:left="-400px"
			style:top="1000px"
		>
			<img src="https://media1.tenor.com/m/AIsACQVVdWUAAAAC/awkward-smile-nod.gif" alt="Gif" />
		</div>
	</div>
</div>
