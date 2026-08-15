<script lang="ts">
	import { createScene, Code, code } from '#lib/scene';

	const SCALE = 60;
	const MAX = 4;
	const PAD = 20;
	const CENTER = MAX * SCALE;
	const TEXT_OFFSET = 32;

	const scene = createScene({
		code: `
			const scene = createScene({
				code: \`...\`, view: 'code', radius: 2
			})
				.layout((s) => s.view = 'example', 0.6)
				.tween('radius', 3, 1.4)
				.all((s) => {
					s.codeSelection(code.lines(6,9), 0.4);
					s.tween('radius', 3, 1.4);
				});
		`,
		view: 'code',
		radius: 3
	})
		.codeSelection(code.lines(1, 3), 0.4)
		.codeSelection(code.lines(4), 0.4)
		.layout((s) => (s.view = 'example'), 0.6)
		.all((s) => {
			s.codeSelection(code.lines(5), 0.4);
			s.tween('radius', 4, 1.4);
		})
		.all((s) => {
			s.codeSelection(code.lines(6, 9), 0.4);
			s.tween('radius', 3, 1.4);
		})
		.codeSelection();
</script>

<div data-notes>
	A scene can mix code morphing with a layout transition and a value tween, all stepped together.
	The circle radius tweens while the code highlights jump to the matching lines.
</div>

<div class="flex items-center gap-24">
	<div data-layout="code">
		<Code class="text-xl" />
	</div>

	{#if scene.view === 'example'}
		<svg
			data-layout="scene"
			viewBox="{-PAD} {-PAD} {CENTER * 2 + PAD * 2} {CENTER * 2 + PAD * 2}"
			class="w-120"
		>
			<circle cx={CENTER} cy={CENTER} r={scene.radius * SCALE} class="fill-red-500" />
			<line
				x1={CENTER}
				y1={CENTER}
				x2={CENTER + scene.radius * SCALE}
				y2={CENTER}
				stroke-width="6"
				stroke-dasharray="10 10"
				class="stroke-black"
			/>
			<text
				x={CENTER + (scene.radius * SCALE) / 2}
				y={CENTER + TEXT_OFFSET}
				class="fill-black font-mono text-lg font-semibold"
				text-anchor="middle"
				dominant-baseline="middle"
			>
				r = {scene.radius.toFixed(2)}
			</text>
		</svg>
	{/if}
</div>
