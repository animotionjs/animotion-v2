<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { getSlide } from '../slides/context.svelte.js';
	import { diffTokens, parseHighlight, positioned, type MorphToken } from '../slides/highlight.js';
	import { computeMorphSpans, computeSettledSpans, morphBounds } from '../slides/code-render.js';

	interface CodeStep {
		code?: string;
		append?: string;
		prepend?: string;
		replace?: [string, string];
		remove?: string;
		highlight?: string;
	}

	interface Props {
		code?: string;
		steps?: (string | CodeStep)[];
		language?: string;
		class?: string;
		lineNumbers?: boolean;
		lineHeight?: number;
		unselectedOpacity?: number;
	}

	let {
		code,
		steps = [],
		language = 'ts',
		class: classes = 'text-lg',
		lineNumbers = false,
		lineHeight = 1.5,
		unselectedOpacity = 0.32
	}: Props = $props();

	const states = $derived.by(() => {
		const list: { code: string; highlight?: string }[] = [];
		let current = code ?? '';

		if (code !== undefined || steps.length === 0) {
			list.push({ code: current });
		}

		for (const step of steps) {
			if (typeof step === 'string') {
				current = step;
				list.push({ code: current });
				continue;
			}

			if (step.code !== undefined) current = step.code;
			if (step.append !== undefined) current += step.append;
			if (step.prepend !== undefined) current = step.prepend + current;
			if (step.replace !== undefined) current = current.replace(step.replace[0], step.replace[1]);
			if (step.remove !== undefined) current = current.replace(step.remove, '');
			list.push({ code: current, highlight: step.highlight });
		}

		if (list.length === 0) list.push({ code: current });
		return list;
	});

	const runtime = getSlide();
	let root: HTMLElement;
	let start = $state<number | null>(null);

	let displayed = $state<{ code: string; highlight?: string } | null>(null);
	let tokens = $state<MorphToken[] | null>(null);
	let progress = $state(1);
	let selection = $state('');
	let previousSelection = $state('');
	let frame = 0;
	let initialized = false;

	onMount(() => {
		const parent = root.closest<HTMLElement>('[data-step]');
		const at = parent ? Number(parent.dataset.step) : 0;
		start = Number.isFinite(at) ? at : 0;
	});

	onDestroy(() => cancelAnimationFrame(frame));

	const index = $derived(
		start === null ? 0 : Math.max(0, Math.min(states.length - 1, runtime.step - start))
	);
	const current = $derived(states[index] ?? { code: '' });

	/*
	 * Morph from the code that was on screen to the new state. The frame clock
	 * drives token positions, so this cannot run as a CSS transition.
	 */
	function morphTo(next: { code: string; highlight?: string }) {
		if (!initialized) {
			initialized = true;
			displayed = next;
			return;
		}

		const before = untrack(() => displayed);
		if (!before) {
			displayed = next;
			return;
		}

		const codeChanged = before.code !== next.code;
		const highlightChanged = before.highlight !== next.highlight;
		if (!codeChanged && !highlightChanged) {
			cancelAnimationFrame(frame);
			tokens = null;
			progress = 1;
			displayed = next;
			return;
		}

		tokens = diffTokens(before.code, next.code, language);
		previousSelection = before.highlight ?? '';
		selection = next.highlight ?? '';
		progress = 0;
		cancelAnimationFrame(frame);

		const started = performance.now();
		const duration = 420;

		const tick = (now: number) => {
			const value = Math.min(1, Math.max(0, (now - started) / duration));
			progress = value;
			if (value < 1) {
				frame = requestAnimationFrame(tick);
				return;
			}
			tokens = null;
			displayed = next;
		};

		frame = requestAnimationFrame(tick);
	}

	$effect(() => {
		if (start === null) return;
		morphTo(current);
	});

	const selected = $derived(parseHighlight(selection));
	const previouslySelected = $derived(parseHighlight(previousSelection));

	const spans = $derived.by(() => {
		if (tokens) {
			return computeMorphSpans(tokens, progress, selected, previouslySelected, unselectedOpacity);
		}
		if (!displayed) return [];
		return computeSettledSpans(
			positioned(displayed.code, language),
			parseHighlight(displayed.highlight),
			unselectedOpacity
		);
	});

	const bounds = $derived.by(() => {
		if (tokens) return morphBounds(tokens, progress);

		let width = 0;
		let height = 0;
		for (const span of spans) {
			width = Math.max(width, span.leftCh + span.text.length);
			height = Math.max(height, span.topEm + 1);
		}

		/* a trailing blank line has no token, but still takes a row */
		const lines = displayed?.code.split('\n').length ?? 1;
		return { width, height: Math.max(1, height, lines) };
	});

	const lineCount = $derived(Math.max(1, Math.ceil(bounds.height)));
	const numberWidth = $derived(
		Math.max(1, ...states.map((state) => String(state.code.split('\n').length).length))
	);
	const gutter = $derived(lineNumbers ? numberWidth + 1 : 0);
	const lineRows = $derived(Array.from({ length: lineCount }, (_, index) => index + 1));
</script>

<div
	bind:this={root}
	data-code-steps={states.length}
	class={[tokens ? 'overflow-x-hidden' : 'overflow-x-auto', 'overflow-y-hidden', classes]}
>
	<div
		class="relative font-mono"
		style:width="{bounds.width + gutter}ch"
		style:height="{bounds.height * lineHeight}em"
		style:line-height={lineHeight}
	>
		{#if lineNumbers}
			<div
				class="absolute top-0 left-0 text-right text-white/30 select-none"
				style:width="{gutter}ch"
				style:height="{bounds.height * lineHeight}em"
			>
				{#each lineRows as row (row)}
					<span
						class="absolute"
						style:top="{(row - 1) * lineHeight}em"
						style:right="1ch"
						style:width="{numberWidth}ch">{row}</span
					>
				{/each}
			</div>
		{/if}

		{#each spans as span (span.key)}
			<span
				data-code-token
				class="absolute whitespace-pre"
				style:left="{span.leftCh + gutter}ch"
				style:top="{span.topEm * lineHeight}em"
				style:opacity={span.alpha}
				style:color={span.color || undefined}>{span.text}</span
			>
		{/each}
	</div>
</div>
