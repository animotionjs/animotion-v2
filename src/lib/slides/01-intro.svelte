<script lang="ts">
	import { scene } from '#lib/scene';

	const s = scene({ opacity: 0, scale: 0, hidden: true })
		.slideTransition({ duration: 0.4 })
		.tween('opacity', 1, 0.6)
		.all(
			(t) => t.layout(() => (t.hidden = false), 0.6),
			(t) => t.tween('scale', 1, 0.6)
		);
</script>

<div class="grid place-items-center gap-16">
	<p data-layout="title" class="text-6xl font-bold" style:opacity={s.opacity}>🪄 Animotion</p>

	<div
		data-layout="circle"
		class={['h-48 w-48 rounded-full bg-amber-400', { hidden: s.hidden }]}
		style:scale={s.scale}
	></div>
</div>
