<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		computeMorphSpans,
		computeSettledSpans,
		morphBounds,
		morphDigitCount,
		selectionOpacity,
		type RenderSpan
	} from '../scene/code-render.svelte.js';
	import {
		computeRevealTarget,
		computeSelectionTarget,
		fadeMaskImage,
		revealTargetLine,
		scrollMask
	} from '../scene/code-scroll.js';
	import { getCodeState, type CodeRange } from '../scene/code.svelte.js';
	import { clamp, easeInOutSine, lerp } from '../scene/easing.js';

	interface Props {
		/** Size and typography classes, e.g. `text-2xl` (default). */
		class?: string;
		/** Opacity of code outside the current selection (default `0.32`). */
		unselectedOpacity?: number;
		/** Line height in `em` (default `1.5`). */
		lineHeight?: number;
		/** Show a line-number gutter (default `false`). */
		lineNumbers?: boolean;
		/** Fade lines out at the scroll edges (default `true`). */
		fade?: boolean;
		/** Fade size in `em` (default `4`). */
		fadeSize?: number;
		/** Which scrolling to drive: `'both'`, `'selection'`, `'reveal'`, or `'none'`. */
		scrollMode?: 'both' | 'selection' | 'reveal' | 'none';
	}

	let {
		class: classes = 'text-2xl',
		unselectedOpacity = 0.32,
		lineHeight = 1.5,
		lineNumbers = false,
		fade = true,
		fadeSize = 4,
		scrollMode = 'both'
	}: Props = $props();
	const slot = getCodeState();

	const spans: RenderSpan[] = $derived.by(() => {
		if (Array.isArray(slot.tokens)) {
			return computeMorphSpans(
				slot.tokens,
				slot.rawProgress,
				slot.morphProgress,
				slot.selection,
				slot.selectionProgress,
				slot.previousSelection,
				unselectedOpacity
			);
		}
		const settled = slot.settled ?? [];
		if (settled.length > 0) {
			return computeSettledSpans(
				settled,
				slot.selection,
				slot.selectionProgress,
				slot.previousSelection,
				unselectedOpacity
			);
		}
		return fallbackSpans(slot.resolved);
	});

	const bounds = $derived.by(() => {
		if (Array.isArray(slot.tokens)) {
			return morphBounds(slot.tokens, slot.morphProgress);
		}
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
	const digits = $derived(
		Array.isArray(slot.tokens) ? morphDigitCount(slot.tokens) : String(lineCount).length
	);
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

	let codeBlock = $state<HTMLElement>();
	let scrollTop = $state(0);
	let clientHeight = $state(0);
	let scrollHeight = $state(0);
	let revealViewportHeight = $state(0);

	function refreshMeasurements() {
		if (!codeBlock) return;
		scrollTop = codeBlock.scrollTop;
		clientHeight = codeBlock.clientHeight;
		scrollHeight = codeBlock.scrollHeight;
		if (
			Array.isArray(slot.tokens) &&
			revealViewportHeight <= 0 &&
			codeBlock.scrollHeight > codeBlock.clientHeight
		) {
			revealViewportHeight = codeBlock.clientHeight;
		}
	}

	// ResizeObserver also catches changes caused by font loading and by the
	// parent's max-height, neither of which necessarily changes a prop
	$effect(() => {
		if (!codeBlock || typeof ResizeObserver === 'undefined') return;
		void bounds;
		void classes;
		void lineHeight;

		const observer = new ResizeObserver(refreshMeasurements);
		observer.observe(codeBlock);
		refreshMeasurements();
		return () => observer.disconnect();
	});

	const mask = $derived(scrollMask(scrollTop, clientHeight, scrollHeight));
	const maskImage = $derived.by(() => {
		if (!fade || mask === 'none' || clientHeight <= 0) return '';
		return fadeMaskImage(mask, fadeSize);
	});

	function fontSizePx() {
		return codeBlock ? parseFloat(getComputedStyle(codeBlock).fontSize) || 0 : 0;
	}

	function applyScroll(value: number) {
		if (!codeBlock) return;
		codeBlock.scrollTop = value;
		scrollTop = codeBlock.scrollTop;
	}

	let revealFrom = $state(0);
	let revealBottomLine = $state<number | null>(null);
	let previousTokens: typeof slot.tokens = null;
	let revealFrame: number | null = null;

	function cancelRevealFrame() {
		if (revealFrame === null) return;
		cancelAnimationFrame(revealFrame);
		revealFrame = null;
	}

	function applyFinalReveal() {
		revealFrame = null;
		if (!codeBlock) return;
		refreshMeasurements();
		if (scrollMode === 'none' || scrollMode === 'selection') return;
		if (slot.selectionProgress !== null && scrollMode !== 'reveal') return;
		if (revealBottomLine === null) return;

		const fontSize = fontSizePx();
		const lineHeightPx = fontSize * lineHeight;
		const fadeSizePx = fade ? fadeSize * fontSize : 0;
		if (lineHeightPx <= 0 || clientHeight <= 0) return;

		const target = computeRevealTarget(
			revealBottomLine,
			lineHeightPx,
			clientHeight,
			scrollHeight,
			fadeSizePx,
			revealFrom
		);
		if (target !== null) applyScroll(target);
	}

	$effect(() => {
		const tokens = slot.tokens;
		if (Array.isArray(tokens) && !Array.isArray(previousTokens)) {
			cancelRevealFrame();
			revealViewportHeight = 0;
			revealBottomLine = revealTargetLine(tokens);
			if (codeBlock) {
				revealFrom = codeBlock.scrollTop;
				refreshMeasurements();
			}
		} else if (!Array.isArray(tokens) && Array.isArray(previousTokens)) {
			cancelRevealFrame();
			revealFrame = requestAnimationFrame(applyFinalReveal);
		}
		previousTokens = tokens;
	});
	onDestroy(cancelRevealFrame);

	let selectionFrom = $state(0);
	let selectionSession: CodeRange[] | null = null;
	$effect(() => {
		const progress = slot.selectionProgress;
		if (progress === null) {
			selectionSession = null;
			return;
		}
		if (selectionSession !== slot.selection && codeBlock) {
			selectionSession = slot.selection;
			selectionFrom = codeBlock.scrollTop;
		}
	});

	// selection scrolling is deliberately in the same effect as reveal
	// scrolling: when both are active, the selection branch wins
	$effect(() => {
		if (!codeBlock || scrollMode === 'none') return;
		const fontSize = fontSizePx();
		const lineHeightPx = fontSize * lineHeight;
		const fadeSizePx = fade ? fadeSize * fontSize : 0;
		if (lineHeightPx <= 0 || clientHeight <= 0) return;

		if (slot.selectionProgress !== null && scrollMode !== 'reveal') {
			const target = computeSelectionTarget(
				slot.selection,
				lineCount,
				lineHeightPx,
				clientHeight,
				scrollHeight,
				fadeSizePx,
				selectionFrom
			);
			if (target !== null) {
				applyScroll(
					lerp(selectionFrom, target, easeInOutSine(clamp(slot.selectionProgress, 0, 1)))
				);
			}
			return;
		}

		if (scrollMode === 'selection' || !Array.isArray(slot.tokens)) return;
		const bottomLine = revealBottomLine;
		if (bottomLine === null) return;
		const finalBounds = morphBounds(slot.tokens, 1);
		const revealHeight = revealViewportHeight > 0 ? revealViewportHeight : clientHeight;
		const finalScrollHeight = Math.max(
			scrollHeight,
			finalBounds.height * lineHeightPx,
			revealHeight
		);
		const target = computeRevealTarget(
			bottomLine,
			lineHeightPx,
			revealHeight,
			finalScrollHeight,
			fadeSizePx,
			revealFrom
		);
		if (target !== null)
			applyScroll(lerp(revealFrom, target, clamp(slot.progress ?? slot.rawProgress, 0, 1)));
	});
</script>

<div
	bind:this={codeBlock}
	onscroll={() => (scrollTop = codeBlock?.scrollTop ?? 0)}
	class="code-block font-mono {classes}"
	role="code"
	style:max-height="100%"
	style:overflow-x="hidden"
	style:overflow-y="auto"
	style:-webkit-mask-image={maskImage || undefined}
	style:mask-image={maskImage || undefined}
	style:scrollbar-width="none"
>
	<div
		style:position="relative"
		style:white-space="pre"
		style:line-height={lineHeight}
		style:width="{bounds.width + gutter}ch"
		style:height="{bounds.height * lineHeight}em"
		style:overflow="hidden"
	>
		{#if lineNumbers}
			<div
				class="text-right text-white/35"
				style:position="absolute"
				style:left="0"
				style:top="0"
				style:width="{gutter}ch"
				style:height="{bounds.height * lineHeight}em"
				style:overflow="hidden"
				style:user-select="none"
			>
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
	</div>
</div>

<style>
	.code-block::-webkit-scrollbar {
		display: none;
	}
</style>
