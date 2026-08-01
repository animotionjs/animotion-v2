<script lang="ts">
	import { createScene } from '#lib/scene';

	const scene = createScene({ opacity: 0, scale: 0, hidden: true })
		.slideTransition({ duration: 0.4 })
		.tween('opacity', 1, 0.6)
		.all((s) => {
			s.layout(() => (s.hidden = false), 0.6);
			s.tween('scale', 1, 0.6);
		});
</script>

<div class="grid place-items-center gap-16">
	<p data-layout="title" class="text-6xl font-bold" style:opacity={scene.opacity}>🪄 Animotion</p>

	<div
		data-layout="circle"
		class={['h-48 w-48 rounded-full bg-amber-400', { hidden: scene.hidden }]}
		style:scale={scene.scale}
	></div>
</div>
