<script lang="ts">
	import { createScene } from '#lib/scene';

	const panels = [
		{
			key: 'before',
			rendering: 'auto',
			label: 'text-rendering: auto',
			text: 'Browsers snap every letter to the pixel grid so still text looks crisp. But that rounding means animated text freezes for a few frames, then jumps.',
			dot: 'bg-rose-500',
			edge: 'border-rose-500'
		},
		{
			key: 'after',
			rendering: 'geometricprecision',
			label: 'text-rendering: geometricprecision',
			text: 'This skips the pixel grid and draws each letter at its exact mathematical size. Every frame shows real, slightly bigger letters, so growth is smooth.',
			dot: 'bg-sky-500',
			edge: 'border-sky-500'
		}
	];

	const scene = createScene({ grown: false })
		.noTransition()
		.layout((s) => (s.grown = true), 2, { scale: false });
</script>

<div class="relative h-full w-full overflow-hidden bg-zinc-950">
	<div
		class="absolute grid-bg"
		style:left="-6000px"
		style:top="-4000px"
		style:width="12000px"
		style:height="8000px"
	></div>

	<div class="relative flex h-full flex-col justify-center gap-20 px-20">
		<h1 data-layout="title" class="text-7xl font-bold text-white capitalize">
			Why animated text jitters
		</h1>

		{#each panels as panel (panel.key)}
			<div class="flex flex-col gap-5">
				<span
					data-layout={`label-${panel.key}`}
					class="flex items-center gap-3 font-mono text-3xl tracking-wider text-zinc-400"
				>
					<span class="h-6 w-6 rounded-full {panel.dot}"></span>
					{panel.label}
				</span>

				<div
					data-layout={panel.key}
					class={[
						'border-l-4 bg-white/5 p-10 text-zinc-100 backdrop-blur',
						panel.edge,
						scene.grown ? 'text-7xl' : 'text-5xl'
					]}
					style:text-rendering={panel.rendering}
				>
					{panel.text}
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.grid-bg {
		background-image: linear-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px),
			linear-gradient(90deg, rgb(255 255 255 / 0.06) 1px, transparent 1px);
		background-size: 100px 100px;
	}
</style>
