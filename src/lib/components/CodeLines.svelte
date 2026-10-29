<script lang="ts">
	import { highlight as highlightCode, type Token } from '../slides/highlight.js';

	interface Props {
		code: string;
		language?: string;
	}

	let { code, language = 'ts' }: Props = $props();

	const lines: Token[][] = $derived(highlightCode(code, language));
</script>

<div class="font-mono">
	{#each lines as line, index (index)}
		<div style:line-height="1.5">
			<span class="whitespace-pre">
				{#each line as token, tokenIndex (tokenIndex)}
					<span style:color={token.color}>{token.text}</span>
				{/each}
				{#if line.length === 0}&nbsp;{/if}
			</span>
		</div>
	{/each}
</div>
