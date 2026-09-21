<!--
<script lang="ts">
	import { Code, code, createScene, linear } from '#lib/scene';
	import { Mark, annotate } from '@sveltecraft/annotate';

	const CODE = `
		<script>
  const clock = new Tween(0, { duration: 2000 });
  const mark = annotate(clock);
		<\/script>

		<span {...mark({ type: 'underline', color: '#ffff00', at: 0 })}>
		  spread syntax
		</span>

		<Mark type="underline" color="#ffff00" at={1}>
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
		.all((t) => t.tween('clock', 1, 1, linear).codeSelection(code.lines(6, 8), 0.3))
		.wait(1)
		.all((t) => t.tween('clock', 2, 1, linear).codeSelection(code.lines(10, 12), 0.3))
		.wait(0.5);

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

	<div class="relative flex h-[50%] items-center justify-center px-16">
		<div class="flex flex-col gap-12">
			<p class="text-left text-8xl text-stone-100">
				<span {...mark({ type: 'underline', color: '#ffff00', at: 0 })}>
					<span class="font-bold">spread</span>
					<span>syntax</span>
				</span>
			</p>
			<p class="text-left text-8xl text-stone-100">
				<Mark type="underline" color="#ffff00" at={1}>
					<span class="font-bold">component</span>
					<span>syntax</span>
				</Mark>
			</p>
		</div>
	</div>

	<div class="absolute inset-x-0 bottom-0 flex h-[50%] items-center justify-center bg-black p-6">
		<Code class="text-4xl leading-tight" />
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
