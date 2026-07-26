<script lang="ts">
	import { timeline } from '#lib/timeline';

	const tl = timeline({ opacity: 0, scale: 0, hidden: true });

	tl.tween('opacity', 1, 0.6).parallel(
		() => tl.tween('scale', 1, 0.6),
		() => tl.layout(() => (tl.hidden = false), 0.6)
	);
</script>

<div class="grid place-items-center gap-16">
	<p data-layout="title" class="text-6xl font-bold" style:opacity={tl.opacity}>🪄 Animotion</p>

	<div
		data-layout="circle"
		class={['h-48 w-48 rounded-full bg-amber-400', { hidden: tl.hidden }]}
		style:scale={tl.scale}
	></div>
</div>
