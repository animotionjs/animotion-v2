<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Accessible name / tooltip. */
		label: string;
		onclick: () => void;
		/** Highlights the button as the primary control. */
		accent?: boolean;
		children: Snippet;
	}

	let { label, onclick, accent = false, children }: Props = $props();
</script>

<button
	type="button"
	class={['rounded p-1.5', { 'bg-accent/30': accent, 'hover:bg-surface': !accent }]}
	aria-label={label}
	title={label}
	{onclick}
>
	<svg viewBox="0 0 18 16" class="h-4 w-4 fill-current" aria-hidden="true">
		{@render children()}
	</svg>
</button>
