<script lang="ts">
	import * as R from '@sveltecraft/rough';
	import { Code, createScene } from '#lib/scene';
	import { MAP_HEIGHT, MAP_WIDTH, REGIONS } from './data.js';

	const SCALE = 3;
	const WIDTH = MAP_WIDTH * SCALE;
	const HEIGHT = MAP_HEIGHT * SCALE;
	const regions = $derived(
		REGIONS.map((region) => ({
			...region,
			polys: region.polys.map((ring) =>
				ring.map(([x, y]) => [x * SCALE, y * SCALE] as [number, number])
			),
			islets: region.islets.map((ring) =>
				ring.map(([x, y]) => [x * SCALE, y * SCALE] as [number, number])
			)
		}))
	);

	const scene = createScene({
		boil: 0,
		code: `
			<script>
				import * as R from '@sveltecraft/rough';

				const scene = createScene({ boil: 0 })
					.tick(({ frame }) => scene.boil = Math.floor(frame / 8), 4);
			<\/script>

			<R.Canvas fillStyle="zigzag">
				{#each regions as region, r (region.name)}
					<R.Polygon points={ring} fill={region.fill} seed={scene.boil + r} />
				{/each}
			</R.Canvas>
		`,
		language: 'svelte'
	})
		.noTransition()
		.wait(0.1)
		.tick(({ frame }) => {
			scene.boil = Math.floor(frame / 6);
		}, 4);
</script>

<div class="relative h-full w-full overflow-hidden bg-zinc-950">
	<div
		class="grid-bg absolute"
		style:left="-6000px"
		style:top="-4000px"
		style:width="12000px"
		style:height="8000px"
	></div>

	<div class="relative flex h-[50%] flex-col items-center justify-center p-6">
		<div class="flex min-h-0 w-full flex-1 items-center justify-center">
			<R.Canvas
				width={WIDTH}
				height={HEIGHT}
				stroke="#fff"
				strokeWidth={1.2 * SCALE}
				roughness={2}
				bowing={2}
				fillWeight={3}
				hachureGap={15}
				class="h-auto! max-h-full w-auto! max-w-full"
			>
				{#each regions as region, r (region.name)}
					{#each region.polys as ring, i (i)}
						<R.Polygon points={ring} fill={region.fill} fillStyle="zigzag" seed={scene.boil + r} />
					{/each}
					{#each region.islets as ring, i (i)}
						<R.Polygon points={ring} strokeWidth={0.9 * SCALE} seed={scene.boil + r} />
					{/each}
				{/each}
			</R.Canvas>
		</div>

		<ul
			class="flex shrink-0 flex-wrap items-center justify-center gap-x-8 gap-y-2 pt-2 text-xl text-neutral-400"
		>
			{#each regions as region (region.name)}
				<li class="flex items-center">
					<span class="mr-2 h-5 w-5 rounded-sm" style:background={region.fill}></span>
					<span>{region.name}</span>
				</li>
			{/each}
		</ul>
	</div>

	<div
		class="absolute inset-x-0 bottom-0 flex h-[50%] items-center justify-center bg-black/60 p-6 backdrop-blur"
	>
		<Code class="text-3xl leading-tight" />
	</div>
</div>

<style>
	.grid-bg {
		background-image:
			linear-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px),
			linear-gradient(90deg, rgb(255 255 255 / 0.06) 1px, transparent 1px);
		background-size: 100px 100px;
	}
</style>
