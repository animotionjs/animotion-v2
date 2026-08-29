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
	class={[
		'cursor-pointer rounded p-2 transition-colors',
		{ 'bg-accent/30': accent, 'hover:bg-surface': !accent }
	]}
	aria-label={label}
	title={label}
	{onclick}
>
	<svg viewBox="0 0 18 16" class="h-5 w-5 fill-current" aria-hidden="true">
		{@render children()}
	</svg>
</button>
