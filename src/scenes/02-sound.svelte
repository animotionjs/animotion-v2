<script lang="ts">
	import { Code, code, createScene, easeOut, linear } from '#lib/scene';

	const SOUND_CODE = `<script>
	import { createScene, easeOut, linear } from '#lib/scene';

	const scene = createScene({ depth: 8, cursorX: 380, cursorY: -360 })
		.all((s) => {
			s.tween('cursorX', 0, 1, linear);
			s.tween('cursorY', 0, 1, easeOut);
			s.sound('riser', { duration: 1, volume: 0.4 });
		})
		.all((s) => {
			s.tween('depth', 0, 0.5);
			s.sound('impact', { duration: 0.5, volume: 0.4 });
		})
		.tween('depth', 8, 1);
<\/script>`;

	const scene = createScene({
		depth: 8,
		cursorX: 380,
		cursorY: -360,
		code: SOUND_CODE,
		language: 'svelte'
	})
		.noTransition()
		.wait(0.5)
		.all((s) =>
			s
				.tween('cursorX', 0, 1, linear)
				.tween('cursorY', 0, 1, easeOut)
				.sound('riser', { duration: 1, volume: 0.4 })
				.codeSelection(code.lines(5, 9), 0.4)
		)
		.wait(0.5)
		.all((s) =>
			s
				.tween('depth', 0, 0.5)
				.sound('impact', { duration: 0.5, volume: 0.4 })
				.codeSelection(code.lines(10, 13), 0.4)
		)
		.tween('depth', 8, 1)
		.codeSelection()
		.wait(0.5);
</script>

<div data-notes>Cursor whooshes in, then press and click happen together.</div>

<div class="relative h-full w-full overflow-hidden bg-zinc-950 text-white">
	<section
		class="relative flex h-[45%] flex-col items-center justify-center overflow-hidden border-b border-white/10 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px]"
	>
		<div class="relative">
			<div class="absolute inset-0 translate-y-3 rounded-[2rem] bg-amber-700"></div>
			<button
				type="button"
				class="relative rounded-[2rem] bg-amber-300 px-20 py-12 text-8xl font-bold text-zinc-950"
				style:transform={`translateY(${8 - scene.depth}px)`}
			>
				Subscribe
			</button>
			<div
				class="pointer-events-none absolute top-1/2 left-3/4 z-10"
				style:transform={`translate(${scene.cursorX + scene.depth * 4}px, ${scene.cursorY - scene.depth * 4}px)`}
				aria-hidden="true"
			>
				<svg
					width="72"
					height="72"
					viewBox="0 0 24 24"
					fill="white"
					stroke="black"
					stroke-width="1.5"
					stroke-linejoin="round"
				>
					<path d="M5 3 L19 12 L12.5 13.5 L9.5 20 Z" />
				</svg>
			</div>
		</div>
	</section>

	<section class="flex h-[55%] items-center justify-center bg-black/60 p-6 backdrop-blur-md">
		<div
			class="mx-auto flex h-full w-[92%] max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90"
		>
			<div
				class="flex items-center gap-3 border-b border-white/10 px-8 py-5 text-2xl font-normal text-white/80"
			>
				<span class="size-3 shrink-0 rounded-full bg-amber-300"></span>
				<span class="leading-none">scene</span>
			</div>
			<div class="min-h-0 flex-1 overflow-hidden px-8 py-6">
				<Code class="text-2xl sm:text-3xl" lineHeight={1.35} unselectedOpacity={0.35} />
			</div>
		</div>
	</section>
</div>
