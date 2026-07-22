<script lang="ts">
	import { pause, scene, signal } from '#lib/timeline';

	const opacity = signal(0);
	const scale = signal(0);

	scene(function* () {
		yield* opacity.tween(1, 1);
		yield pause();
		yield* scale.tween(1, 1);
		yield pause();
	});
</script>

<h1 style:opacity={opacity()} class="text-6xl font-bold">🪄 Animotion</h1>
<p style:scale={scale()} class="mt-4 text-2xl text-gray-400">A presentation framework</p>
