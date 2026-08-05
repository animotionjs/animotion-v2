<script lang="ts">
	import { easeInOut, createScene } from '#lib/scene';

	let fill = $state(0);
	let seconds = $state(0);

	createScene().tick(
		({ progress, time }) => {
			fill = progress * 100;
			seconds = time;
		},
		2.4,
		easeInOut
	);
</script>

<div class="w-full max-w-2xl space-y-10 text-center">
	<h1 class="text-5xl font-bold">tick step</h1>

	<div class="mx-auto w-full max-w-lg">
		<div class="mb-2 flex justify-between text-2xl">
			<span class="text-gray-400">progress</span>
			<span class="tabular-nums">{Math.round(fill)}%</span>
		</div>

		<div class="h-4 overflow-hidden rounded-full bg-zinc-800">
			<div class="h-full rounded-full bg-amber-400" style:width="{fill}%"></div>
		</div>
	</div>

	<div class="text-2xl text-gray-400">time</div>
	<div class="text-6xl font-bold tabular-nums">{seconds.toFixed(1)}s</div>
</div>
