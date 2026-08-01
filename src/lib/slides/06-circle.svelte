<script lang="ts">
	import { createScene } from '#lib/scene';

	const scene = createScene({ radius: 200 })
		.slideTransition({ duration: 0.4 })
		.tween('radius', 400, 1.5);
	const area = $derived(Math.round(Math.PI * scene.radius ** 2));
</script>

<div class="flex flex-col items-center gap-6">
	<svg viewBox="-240 -240 880 880" class="w-140">
		<line
			x1="200"
			y1="200"
			x2={200 + scene.radius}
			y2="200"
			stroke-width="2"
			stroke-dasharray="4 4"
			class="stroke-amber-400"
		/>
		<circle
			cx="200"
			cy="200"
			r={scene.radius}
			stroke-width="2"
			class="fill-amber-400/20 stroke-amber-400"
		/>
		<circle cx="200" cy="200" r="3" class="fill-amber-400" />
		<text
			x="200"
			y="160"
			class="fill-white text-2xl"
			text-anchor="middle"
			dominant-baseline="middle"
		>
			A = {area.toLocaleString()}
		</text>
	</svg>
</div>
