<script lang="ts">
	import { Code, code, createScene } from '#lib/scene';

	const CODE = `const scene = createScene({ stretch: false, reflow: false })
	.layout((s) => (s.stretch = true), 1, { scale: true })
	.layout((s) => (s.reflow = true), 1, { scale: false });`;

	const panels = [
		{
			key: 'stretch' as const,
			label: 'scale: true',
			dot: 'bg-rose-500',
			edge: 'border-rose-500'
		},
		{
			key: 'reflow' as const,
			label: 'scale: false',
			dot: 'bg-sky-500',
			edge: 'border-sky-500'
		}
	];

	const scene = createScene({ code: CODE, language: 'ts', stretch: false, reflow: false })
		.wait(0.5)
		.all((s) => {
			s.layout((x) => (x.stretch = true), 1, { scale: true });
			s.codeSelection(code.lines(2), 0.3);
		})
		.wait(0.25)
		.all((s) => {
			s.layout((x) => (x.reflow = true), 1, { scale: false });
			s.codeSelection(code.lines(3), 0.3);
		})
		.wait(0.5);
</script>

<div class="relative h-full w-full overflow-hidden bg-zinc-950">
	<div
		class="absolute grid-bg"
		style:left="-6000px"
		style:top="-4000px"
		style:width="12000px"
		style:height="8000px"
	></div>

	<div class="relative flex h-[58%] flex-col justify-center gap-10 px-16">
		<h1 data-layout="title" class="text-7xl font-bold text-white capitalize">
			How Animotion resizes boxes
		</h1>
		<p data-layout="hint" class="text-2xl text-zinc-400">
			This engine can grow a box in two ways. With <span class="font-mono">scale: true</span> it
			stretches the finished box on the GPU: fast, but whatever is inside warps while it moves. With
			<span class="font-mono">scale: false</span> it lays out every frame for real, so nothing ever distorts.
		</p>
		{#each panels as panel (panel.key)}
			<div class="flex flex-col gap-4">
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
						'border-l-4 bg-white/5 p-8 backdrop-blur',
						panel.edge,
						scene[panel.key] ? 'w-full' : 'w-96'
					]}
				>
					<p class="text-5xl font-bold">Resizing</p>
				</div>
			</div>
		{/each}
	</div>

	<div
		class="absolute inset-x-0 bottom-0 flex h-[42%] items-center justify-center bg-black/60 backdrop-blur"
	>
		<Code class="text-4xl leading-tight" />
	</div>
</div>

<style>
	.grid-bg {
		background-image: linear-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px),
			linear-gradient(90deg, rgb(255 255 255 / 0.06) 1px, transparent 1px);
		background-size: 100px 100px;
	}
</style>
