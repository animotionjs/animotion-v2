<script lang="ts">
	import { ASPECT_RATIOS, type AspectRatio } from '../scene/options.js';

	interface Props {
		value: AspectRatio;
	}

	let { value = $bindable() }: Props = $props();

	const names = Object.keys(ASPECT_RATIOS) as AspectRatio[];
</script>

<label class="flex items-center gap-1 text-xs text-foreground/60">
	Aspect ratio
	<select class="rounded bg-surface px-1 py-1 text-xs text-foreground" name="aspect" bind:value>
		{#each names as name (name)}
			<option value={name}>{name}</option>
		{/each}
	</select>
</label>
