<script lang="ts">
	import { Signal } from '$lib/timeline/signal.svelte';
	import { useScene, pause } from '$lib/timeline/runtime.svelte';

	const opacity = new Signal(0);
	const scale = new Signal(0);

	useScene(function* () {
		yield* opacity.tween(1, 1);
		yield pause();
		yield* scale.tween(1, 1);
	});
</script>

<h1 style:opacity={opacity.current} class="text-6xl font-bold">🪄 Animotion</h1>
<p style:scale={scale.current} class="mt-4 text-2xl text-gray-400">A presentation framework</p>
