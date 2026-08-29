<script lang="ts">
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
	const busy = $derived(phase === 'rendering' || phase === 'encoding');
	const percent = $derived.by(() => {
		const snapshot = status.current;
		return snapshot?.phase === 'rendering' ? snapshot.percent : null;
	});
	const tooltip = $derived.by(() => {
		if (busy) return 'cancel render';
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
</script>

<button
	type="button"
	class={[
		'inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
		{
			'bg-red-500/20 text-red-400 hover:bg-red-500/30': busy,
			'bg-green-500/10 text-green-400 hover:bg-green-500/20': showDone,
			'bg-accent/30 text-foreground hover:bg-accent/40': !busy && !showDone
		}
	]}
	aria-label={busy ? 'cancel render' : undefined}
	title={tooltip}
	onclick={activate}
>
	{#if busy}
		<svg viewBox="0 0 18 16" class="h-4 w-4 shrink-0 animate-spin" aria-hidden="true">
			<path
				d="M14.5 8A5.5 5.5 0 1 1 10.97 2.86"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
			/>
		</svg>
		{#if percent !== null}
			<span class="inline-block w-8 text-right tabular-nums">{percent}%</span>
		{/if}
	{:else if showDone}
		<svg viewBox="0 0 18 16" class="h-4 w-4 shrink-0" aria-hidden="true">
			<path
				d="M4 8.5l3.5 3.5L14 4.5"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
			/>
		</svg>
		done
	{:else}
		<svg viewBox="0 0 18 16" class="h-4 w-4 fill-current" aria-hidden="true">
			<rect x="1" y="4" width="10.5" height="8" rx="1.5" />
			<path d="M13 6.5 17 4v8l-4-2.5z" />
		</svg>
		render
	{/if}
</button>
