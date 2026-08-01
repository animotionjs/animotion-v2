<script lang="ts">
	import {
		computeMorphSpans,
		computeSettledSpans,
		type RenderSpan
	} from '../scene/code-render.svelte.js';
	import { getCodeState } from '../scene/code.svelte.js';

	interface Props {
		class?: string;
		unselectedOpacity?: number;
		lineHeight?: number;
	}

	let { class: classes = 'text-2xl', unselectedOpacity = 0.32, lineHeight = 1.5 }: Props = $props();

	const slot = getCodeState();

	const spans: RenderSpan[] = $derived.by(() => {
		if (slot.tokens) {
			return computeMorphSpans(
				slot.tokens,
				slot.progress,
				slot.selection,
				slot.selectionProgress,
				slot.previousSelection,
				unselectedOpacity
			);
		}
		if (slot.settled.length > 0) {
			return computeSettledSpans(
				slot.settled,
				slot.selection,
				slot.selectionProgress,
				slot.previousSelection,
				unselectedOpacity
			);
		}
		return fallbackSpans(slot.resolved);
	});

	const bounds = $derived.by(() => {
		let mx = 0;
		let my = 0;
		for (const span of spans) {
			const r = span.leftCh + span.text.length;
			const b = span.topEm + 1;
			if (r > mx) mx = r;
			if (b > my) my = b;
		}
		return { width: mx, height: my };
	});

	let fbId = 0;

	function fallbackSpans(code: string): RenderSpan[] {
		return code.split('\n').map((text, line) => ({
			key: `fb-${fbId++}`,
			text,
			leftCh: 0,
			topEm: line,
			alpha: 1,
			classes: '',
			selected: 1
		}));
	}
</script>

<pre
	class="code-block font-mono {classes}"
	style:position="relative"
	style:white-space="pre"
	style:line-height={lineHeight}
	style:width="{bounds.width}ch"
	style:height="{bounds.height * lineHeight}em"
	style:overflow="hidden">
	{#each spans as span (span.key)}
		<span
			class={span.classes || undefined}
			style:position="absolute"
			style:left="{span.leftCh}ch"
			style:top="{span.topEm * lineHeight}em"
			style:opacity={span.alpha * span.selected}
			>{span.text}
		</span>
	{/each}
</pre>
