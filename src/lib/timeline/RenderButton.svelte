<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { RenderStatus } from './render.remote.js';

	interface Props {
		status: RenderStatus;
		onstart: () => void;
		oncancel: () => void;
	}

	let { status, onstart, oncancel }: Props = $props();

	const DONE_TIMEOUT = 2000;

	let showDone = $state(false);

	const phase = $derived(status.current?.phase ?? 'idle');
	const busy = $derived(
		phase === 'starting' ||
			phase === 'downloading' ||
			phase === 'measuring' ||
			phase === 'rendering' ||
			phase === 'encoding'
	);
	const percent = $derived.by(() => {
		const snapshot = status.current;
		return snapshot?.phase === 'rendering' ? snapshot.percent : null;
	});
	const label = $derived.by(() => {
		if (phase === 'starting') return 'starting...';
		if (phase === 'downloading') return 'downloading browser...';
		if (phase === 'measuring') return 'measuring...';
		if (phase === 'encoding') return 'encoding...';
		return null;
	});
	const failed = $derived(phase === 'failed');
	const icon = $derived.by(() => {
		if (busy) return 'spinner';
		if (showDone) return 'check';
		return 'video';
	});
	const tooltip = $derived.by(() => {
		if (phase === 'downloading') return 'downloading chromium';
		if (busy) return 'cancel render';
		if (failed) return 'render failed';
		if (showDone) return 'render finished';
		return undefined;
	});

	// the done phase arrives from a stream rather than a click, so an effect is needed to time its exit
	$effect(() => {
		if (phase !== 'done') {
			showDone = false;
			return;
		}
		showDone = true;
		const timer = setTimeout(() => (showDone = false), DONE_TIMEOUT);
		return () => clearTimeout(timer);
	});

	function activate() {
		if (busy) oncancel();
		else onstart();
	}

	const morph: Attachment<HTMLButtonElement> = (button) => {
		let last = button.getBoundingClientRect().width;
		let animation: Animation | null = null;

		const observer = new ResizeObserver(() => {
			// the observer also fires while a morph runs so those events are skipped
			if (animation) return;
			const next = button.getBoundingClientRect().width;
			if (Math.abs(next - last) < 0.5) return;
			if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
				last = next;
				return;
			}
			animation = button.animate([{ width: `${last}px` }, { width: `${next}px` }], {
				duration: 300,
				easing: 'ease-out'
			});
			animation.onfinish = () => {
				// reread the width since the label may have changed during the morph
				last = button.getBoundingClientRect().width;
				animation = null;
			};
		});
		observer.observe(button);

		return () => {
			observer.disconnect();
			animation?.cancel();
		};
	};
</script>

{#snippet glyph(name: string, spin: boolean, stroke: boolean, content: Snippet)}
	<svg
		viewBox="0 0 18 16"
		class={[
			'absolute inset-0 h-4 w-4 transition-opacity duration-300',
			{ 'animate-spin': spin, 'opacity-100': icon === name, 'opacity-0': icon !== name }
		]}
		fill={stroke ? 'none' : 'currentColor'}
		stroke={stroke ? 'currentColor' : 'none'}
		stroke-width={stroke ? 2 : undefined}
		stroke-linecap={stroke ? 'round' : undefined}
		aria-hidden="true"
	>
		{@render content()}
	</svg>
{/snippet}

{#snippet videoShapes()}
	<rect x="1" y="4" width="10.5" height="8" rx="1.5" />
	<path d="M13 6.5 17 4v8l-4-2.5z" />
{/snippet}

{#snippet spinnerShape()}
	<path d="M14.5 8A5.5 5.5 0 1 1 10.97 2.86" />
{/snippet}

{#snippet checkShape()}
	<path d="M4 8.5l3.5 3.5L14 4.5" />
{/snippet}

<button
	type="button"
	class={[
		'inline-flex cursor-pointer items-center gap-1 overflow-hidden rounded px-2 py-1 text-xs transition-colors duration-300 ease-out',
		{
			'bg-red-500/20 text-red-400 hover:bg-red-500/30': busy,
			'bg-green-500/10 text-green-400 hover:bg-green-500/20': showDone,
			'bg-red-500/10 text-red-400 hover:bg-red-500/20': failed,
			'bg-accent/30 text-foreground hover:bg-accent/40': !busy && !showDone && !failed
		}
	]}
	{@attach morph}
	aria-label={busy ? 'cancel render' : undefined}
	title={tooltip}
	onclick={activate}
>
	<span class="relative h-4 w-4 shrink-0">
		{@render glyph('video', false, false, videoShapes)}
		{@render glyph('spinner', true, true, spinnerShape)}
		{@render glyph('check', false, true, checkShape)}
	</span>
	<span class="whitespace-nowrap">
		{#if percent !== null}
			<span class="inline-block w-8 text-right tabular-nums">{percent}%</span>
		{:else}
			{label ?? 'render'}
		{/if}
	</span>
</button>
