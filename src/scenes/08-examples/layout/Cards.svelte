<script lang="ts">
	import { createScene, easeInOutCubic } from '#lib/scene';

	const scene = createScene({ view: 'a' })
		.layout((s) => (s.view = 'b'), 1, { ease: easeInOutCubic })
		.layout((s) => (s.view = 'c'), 1, { ease: easeInOutCubic })
		.layout((s) => (s.view = 'd'), 1, { ease: easeInOutCubic })
		.layout((s) => (s.view = 'a'), 1, { ease: easeInOutCubic });

	const cards = [
		{ label: 'flip', gradient: 'from-amber-300 to-orange-500', span: 'col-span-2' },
		{ label: 'tween', gradient: 'from-sky-400 to-indigo-500', span: '' },
		{ label: 'morph', gradient: 'from-fuchsia-400 to-purple-600', span: '' },
		{ label: 'tick', gradient: 'from-emerald-400 to-teal-500', span: '' },
		{ label: 'code', gradient: 'from-rose-400 to-red-600', span: '' },
		{ label: 'scene', gradient: 'from-slate-200 to-zinc-400', span: 'col-span-2' }
	];
</script>

<div
	class={[
		'grid h-full w-full gap-4',
		{ 'grid-cols-2 grid-rows-3': scene.view === 'a' },
		{ 'grid-cols-4 grid-rows-2': scene.view === 'b' },
		{ 'grid-cols-3 grid-rows-2': scene.view === 'c' },
		{ 'grid-cols-6 grid-rows-1': scene.view === 'd' }
	]}
>
	{#each cards as card (card.label)}
		<div
			data-layout={card.label}
			class={[
				`flex flex-col justify-end rounded-3xl bg-linear-to-br p-6 text-black ${card.gradient}`,
				{ [card.span]: scene.view === 'b' }
			]}
		>
			<p data-layout="{card.label}-text" class="text-5xl font-bold tracking-tight uppercase">
				{card.label}
			</p>
		</div>
	{/each}
</div>
