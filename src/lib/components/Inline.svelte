<script lang="ts">
	import type { Inline as InlinePart } from '../slides/markdown.js';

	interface Props {
		parts: InlinePart[];
	}

	let { parts }: Props = $props();
</script>

{#each parts as part, index (index)}
	{#if part.type === 'text'}
		{part.text}
	{:else if part.type === 'strong'}
		<strong>{part.text}</strong>
	{:else if part.type === 'em'}
		<em>{part.text}</em>
	{:else if part.type === 'code'}
		<code class="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em]">{part.text}</code>
	{:else if part.type === 'link'}
		<a class="text-accent underline" href={part.href}>{part.text}</a>
	{/if}
{/each}
