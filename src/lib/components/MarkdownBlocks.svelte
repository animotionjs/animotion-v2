<script lang="ts">
	import { parseInline, type Block } from '../slides/markdown.js';
	import Code from './Code.svelte';
	import CodeLines from './CodeLines.svelte';
	import Inline from './Inline.svelte';

	interface Props {
		blocks: Block[];
	}

	let { blocks }: Props = $props();
</script>

<div class="flex flex-col gap-6">
	{#each blocks as block, index (index)}
		<div data-layout={block.layout}>
			{#if block.type === 'heading'}
				{#if block.level === 1}
					<h1 class="text-7xl font-bold"><Inline parts={parseInline(block.text)} /></h1>
				{:else if block.level === 2}
					<h2 class="text-6xl font-bold"><Inline parts={parseInline(block.text)} /></h2>
				{:else}
					<h3 class="text-4xl font-bold"><Inline parts={parseInline(block.text)} /></h3>
				{/if}
			{:else if block.type === 'paragraph'}
				<p class="text-2xl leading-relaxed text-white/80">
					<Inline parts={parseInline(block.text)} />
				</p>
			{:else if block.type === 'list'}
				{#if block.ordered}
					<ol class="list-decimal space-y-2 pl-8 text-2xl text-white/80">
						{#each block.items as item, itemIndex (itemIndex)}
							<li><Inline parts={parseInline(item)} /></li>
						{/each}
					</ol>
				{:else}
					<ul class="list-disc space-y-2 pl-8 text-2xl text-white/80">
						{#each block.items as item, itemIndex (itemIndex)}
							<li><Inline parts={parseInline(item)} /></li>
						{/each}
					</ul>
				{/if}
			{:else if block.type === 'code'}
				<div class="rounded-xl bg-white/5 p-6 text-lg">
					{#if block.steps}
						<Code code={block.code} steps={block.steps} language={block.language} />
					{:else}
						<CodeLines code={block.code} language={block.language} />
					{/if}
				</div>
			{:else if block.type === 'quote'}
				<blockquote class="border-l-4 border-accent pl-6 text-2xl text-white/70 italic">
					<Inline parts={parseInline(block.text)} />
				</blockquote>
			{:else if block.type === 'rule'}
				<hr class="border-white/10" />
			{/if}
		</div>
	{/each}
</div>
