<script lang="ts">
	import { createScene } from '#lib/scene';

	const scene = createScene({ r: 251, g: 191, b: 36, view: 'small' }).all((s) => {
		s.layout((s) => (s.view = 'large'), 1, { exit: 'scale', exitEnd: 0.2 });
		s.tween('r', 248, 1);
		s.tween('g', 113, 1);
		s.tween('b', 113, 1);
	});
	const background = $derived(`rgb(${scene.r} ${scene.g} ${scene.b})`);
</script>

<div class="flex items-center gap-24">
	{#if scene.view === 'small'}
		<div
			data-layout="box"
			class="h-50 w-50 rounded bg-red-400"
			style:background-color={background}
		></div>
	{/if}

	{#if scene.view === 'small'}
		<svg
			data-layout="arrow"
			viewBox="0 0 100 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			class="h-10"
		>
			<polyline points="9 6 3 12 9 18" />
			<line x1="3" y1="12" x2="97" y2="12" />
			<polyline points="91 6 97 12 91 18" />
		</svg>
	{/if}

	<div
		data-layout="container"
		class={[
			'overflow-hidden rounded bg-zinc-100 font-mono text-black',
			{ 'w-100': scene.view === 'small', 'w-200': scene.view === 'large' }
		]}
	>
		<div
			data-layout="color"
			class={['w-full', { 'h-50': scene.view === 'small', 'h-100': scene.view === 'large' }]}
			style:background-color="rgb({scene.r}, {scene.g}, {scene.b})"
		></div>

		<div class="space-y-2 p-4">
			{#each ['r', 'g', 'b'] as const as channel (channel)}
				<div class="flex items-center gap-2">
					<span data-layout="{channel}-label" class="w-8 text-lg">
						{channel}:
					</span>

					<div data-layout="{channel}-amount" class="w-200 rounded bg-zinc-300">
						<div
							class="h-full rounded"
							style:width="{(scene[channel] / 255) * 100}%"
							style:background-color={background}
						>
							<span data-layout="{channel}-value" class="px-2 py-1 text-lg tabular-nums">
								{Math.round(scene[channel])}
							</span>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
