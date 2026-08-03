<script lang="ts">
	import {
		computeMorphSpans,
		computeSettledSpans,
		selectionOpacity,
		type RenderSpan
	} from '../scene/code-render.svelte.js';
	import { getCodeState } from '../scene/code.svelte.js';

	interface Props {
		class?: string;
		unselectedOpacity?: number;
		lineHeight?: number;
		lineNumbers?: boolean;
	}

	let {
		class: classes = 'text-2xl',
		unselectedOpacity = 0.32,
		lineHeight = 1.5,
		lineNumbers = false
	}: Props = $props();
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

	const lineCount = $derived(Math.max(0, Math.ceil(bounds.height)));
	const digits = $derived(String(lineCount).length);
	const gap = 1;
	const gutter = $derived(lineNumbers ? digits + gap : 0);
	const lineRows = $derived.by(() => {
		const rows: number[] = [];
		for (let i = 1; i <= lineCount; i++) rows.push(i);
		return rows;
	});

	let fbId = 0;

	function fallbackSpans(code: string): RenderSpan[] {
		return code.split('\n').map((text, line) => ({
			key: `fb-${fbId++}`,
			text,
			leftCh: 0,
			topEm: line,
			alpha: 1,
			color: '',
			selected: 1
		}));
	}
</script>

<pre
	class="code-block font-mono {classes}"
	style:position="relative"
	style:white-space="pre"
	style:line-height={lineHeight}
	style:width="{bounds.width + gutter}ch"
	style:height="{bounds.height * lineHeight}em"
	style:overflow="hidden">
	{#if lineNumbers}
		<div
			class="text-right text-white/35"
			style:position="absolute"
			style:left="0"
			style:top="0"
			style:width="{gutter}ch"
			style:height="{bounds.height * lineHeight}em"
			style:overflow="hidden"
			style:user-select="none">
			{#each lineRows as row (row)}
				<span
					style:position="absolute"
					style:top="{(row - 1) * lineHeight}em"
					style:right="{gap}ch"
					style:width="{digits}ch"
					style:opacity={selectionOpacity(
						row - 1,
						0,
						Infinity,
						slot.selection,
						slot.previousSelection,
						slot.selectionProgress,
						unselectedOpacity
					)}
					>{row}
				</span>
			{/each}
		</div>
	{/if}
	{#each spans as span (span.key)}
		<span
			style:color={span.color || undefined}
			style:position="absolute"
			style:left="{span.leftCh + gutter}ch"
			style:top="{span.topEm * lineHeight}em"
			style:opacity={span.alpha * span.selected}
			>{span.text}
		</span>
	{/each}
</pre>
