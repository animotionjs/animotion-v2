<script lang="ts">
	import * as Rough from '@sveltecraft/rough';
	import { Code, createScene } from '#lib/scene';

	const scene = createScene({
		wave: 0,
		code: `
			<script>
				import * as Rough from '@sveltecraft/rough';
			<\/script>

			<Rough.Canvas width={940} height={400}>
				<Rough.Circle x={470} y={110} diameter={140}
					fill="#a5b4fc" fillStyle="hachure"
					roughness={1.6} seed={3} />
				<!-- ... -->
			</Rough.Canvas>
		`,
		language: 'svelte'
	})
		.noTransition()
		.wait(0.1)
		.tick(({ progress }) => {
			scene.wave = Math.sin(progress * Math.PI);
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

	<div class="relative flex h-[50%] items-center justify-center">
		<Rough.Canvas
			width={940}
			height={400}
			roughness={1.6 + scene.wave * 0.6}
			stroke="#f8fafc"
			strokeWidth={2 + scene.wave}
			fillWeight={2}
			class="h-auto max-w-full"
		>
			<Rough.Rectangle
				x={40}
				y={40}
				width={140}
				height={140}
				fill="white"
				fillStyle="solid"
				seed={1}
			/>
			<Rough.Rectangle
				x={220}
				y={40}
				width={140}
				height={140}
				fill="#f4a08c"
				fillStyle="solid"
				seed={2}
			/>
			<Rough.Circle
				x={470}
				y={110}
				diameter={140}
				fill="#a5b4fc"
				fillStyle="hachure"
				hachureGap={15 - 8 * scene.wave}
				hachureAngle={45}
				seed={3}
			/>
			<Rough.Circle
				x={650}
				y={110}
				diameter={140}
				fill="white"
				fillStyle="cross-hatch"
				hachureGap={8 - 3 * scene.wave}
				seed={4}
			/>
			<Rough.Circle x={830} y={110} diameter={140} seed={5} />
			<Rough.Circle
				x={830}
				y={110}
				diameter={120}
				fill="#4ade80"
				fillStyle="dots"
				hachureGap={14}
				fillWeight={3 + 2 * scene.wave}
				stroke="transparent"
				seed={13}
			/>
			<Rough.Rectangle
				x={40}
				y={220}
				width={140}
				height={140}
				fill="#ef4444"
				fillStyle="hachure"
				hachureGap={15 - 8 * scene.wave}
				hachureAngle={45}
				stroke="blue"
				roughness={2}
				bowing={1}
				fillWeight={3}
				seed={6}
			/>
			<Rough.Rectangle
				x={220}
				y={220}
				width={140}
				height={140}
				fill="#f4a08c"
				fillStyle="hachure"
				hachureGap={20 - 10 * scene.wave}
				hachureAngle={45}
				seed={7}
			/>
			<Rough.Rectangle x={400} y={220} width={140} height={140} seed={8} />
			<Rough.Rectangle
				x={406}
				y={226}
				width={128}
				height={128}
				fill="#f4a08c"
				fillStyle="cross-hatch"
				hachureGap={18 - 5 * scene.wave}
				roughness={0.7}
				stroke="transparent"
				seed={14}
			/>
			<Rough.Rectangle
				x={580}
				y={220}
				width={140}
				height={140}
				fill="#fbbf24"
				fillStyle="zigzag"
				hachureGap={14}
				roughness={1}
				seed={9}
			/>
			<Rough.Rectangle x={760} y={220} width={140} height={140} seed={10} />
			<Rough.Rectangle
				x={790}
				y={240}
				width={100}
				height={100}
				fill="#5eead4"
				fillStyle="dots"
				hachureGap={20}
				fillWeight={3 + 2 * scene.wave}
				stroke="transparent"
				seed={12}
			/>
		</Rough.Canvas>
	</div>

	<div
		class="absolute inset-x-0 bottom-0 flex h-[50%] items-center justify-center bg-black/60 p-6 backdrop-blur"
	>
		<Code class="text-4xl leading-tight" />
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
