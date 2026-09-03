<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Accessible name / tooltip. */
		label: string;
		onclick: () => void;
		/** Highlights the button as the primary control. */
		accent?: boolean;
		/** Disables the button, e.g. stepping past the scene's ends. */
		disabled?: boolean;
		children: Snippet;
	}

	let { label, onclick, accent = false, disabled = false, children }: Props = $props();
</script>

<button
	type="button"
	class={[
		'cursor-pointer rounded p-2 transition-colors',
		{ 'bg-accent/30': accent, 'hover:bg-surface': !accent }
	]}
	aria-label={label}
	title={label}
	{disabled}
	{onclick}
>
	<svg viewBox="0 0 18 16" class="h-5 w-5 fill-current" aria-hidden="true">
		{@render children()}
	</svg>
</button>
