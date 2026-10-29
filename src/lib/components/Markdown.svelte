<script lang="ts">
	import { parseMarkdown } from '../slides/markdown.js';
	import MarkdownBlocks from './MarkdownBlocks.svelte';

	interface Props {
		source: string;
	}

	let { source }: Props = $props();

	const steps = $derived(parseMarkdown(source));
	const rendered = $derived.by(() => {
		const replaces = steps.map((step, index) => (step.replace ? index : -1));
		return steps.map((step, index) => {
			const next = replaces.find((at) => at > index);
			return { ...step, index, until: next === undefined ? undefined : next };
		});
	});
</script>

<div class="flex h-full flex-col justify-center gap-8 p-16">
	{#each rendered as step (step.index)}
		<div
			data-layout={`markdown-${step.index}`}
			data-step={step.index === 0 ? undefined : step.index}
			data-until={step.until}
		>
			<MarkdownBlocks blocks={step.blocks} />
		</div>
	{/each}
</div>
