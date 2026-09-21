<!--
<script lang="ts">
	import { Code, createScene, linear } from '#lib/scene';
	import { annotate } from '@sveltecraft/annotate';

	const CODE = `
		<script>
			import { Tween } from 'svelte/motion';
			import { Mark, annotate } from '@sveltecraft/annotate';

			const clock = new Tween(0, { duration: 2000 });
			const mark = annotate(clock);
		<\/script>

		<span {...mark({ type: 'highlight', color: '#ffff00', at: 1 })}>
			spread syntax
		</span>

		<Mark type="highlight" color="#ffff00" at={2}>
			component syntax
		</Mark>
	`;

	const scene = createScene({
		clock: 0,
		code: CODE,
		language: 'svelte'
	})
		.noTransition()
		.wait(0.5)
		.tween('clock', 8.5, 4.8, linear)
		.wait(0.7);

	const mark = annotate(scene);
</script>

<div class="relative h-full w-full overflow-hidden bg-zinc-950">
	<div
		class="grid-bg absolute"
		style:left="-6000px"
		style:top="-4000px"
		style:width="12000px"
		style:height="8000px"
	></div>

	<div class="relative flex h-[50%] flex-col justify-center px-16">
		<div class="mx-auto flex w-full max-w-4xl flex-col gap-16">
			<h1 class="text-5xl font-bold text-balance text-stone-100">@sveltecraft/annotate 🎉</h1>
			<p class="text-4xl leading-snug text-pretty text-stone-300">
				The latest release adds
				<span
					class="whitespace-nowrap"
					{@attach mark({ type: 'underline', color: '#f97316', at: 0 })}
				>
					underlined text
				</span>
				and
				<span
					class="whitespace-nowrap"
					{@attach mark({ type: 'highlight', color: '#ffff00', at: 1 })}
				>
					marker highlights
				</span>.
				<span
					class="whitespace-nowrap"
					{@attach mark({ type: 'circle', color: '#ef4444', padding: 12, at: 2 })}
				>
					Key numbers
				</span>
				can be ringed for emphasis, while
				<span
					class="whitespace-nowrap"
					{@attach mark({ type: 'strike-through', color: '#7c3aed', at: 3 })}
				>
					outdated claims
				</span>
				and
				<span
					class="whitespace-nowrap"
					{@attach mark({
						type: 'crossed-off',
						color: '#dc2626',
						padding: 10,
						at: 4
					})}
				>
					rejected ideas
				</span>
				are struck through.
			</p>
			<p class="text-4xl leading-snug text-pretty text-stone-300">
				<span
					class="whitespace-nowrap"
					{@attach mark({ type: 'box', color: '#16a34a', padding: 12, at: 5 })}
				>
					Whole passages
				</span>
				can be framed,
				<span
					class="whitespace-nowrap"
					{@attach mark({ type: 'bracket', brackets: ['left', 'right'], color: '#4f46e5', at: 6 })}
				>
					side notes
				</span>
				get brackets in the margin,
				<span
					{@attach mark({ type: 'underline', multiline: true, color: '#0891b2', at: 7, span: 1.5 })}
				>
					and longer passages spanning several lines receive one continuous mark from the first word
					to the last
				</span>.
			</p>
		</div>
	</div>

	<div
		class="absolute inset-x-0 bottom-0 flex h-[50%] items-center justify-center border-t border-white/10 bg-black px-6"
	>
		<Code class="text-3xl leading-tight" />
	</div>
</div>

<style>
	.grid-bg {
		background-image:
			linear-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px),
			linear-gradient(90deg, rgb(255 255 255 / 0.06) 1px, transparent 1px);
		background-size: 100px 100px;
	}
</style>
-->
