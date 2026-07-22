<script lang="ts">
	import { layout, parallel, pause, scene, signal } from '#lib/timeline';

	const opacity = signal(0);
	const scale = signal(0);
	const hidden = signal(true);

	scene(function* () {
		yield* opacity.tween(1, 0.6);
		yield pause();
		yield* parallel(
			layout(() => hidden(false), 0.6),
			scale.tween(1, 0.6)
		);
		yield pause();
	});
</script>

<div class="grid place-items-center gap-16">
	<p data-layout="title" style:opacity={opacity()} class="text-6xl font-bold">🪄 Animotion</p>

	<div
		data-layout="circle"
		style:scale={scale()}
		class={['h-48 w-48 rounded-full bg-amber-400', { hidden: hidden() }]}
	></div>
</div>
