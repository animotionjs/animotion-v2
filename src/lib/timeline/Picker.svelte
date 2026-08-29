<script lang="ts" generics="T extends string | number">
	interface Option {
		value: T;
		label: string;
	}

	interface Props {
		label: string;
		options: Option[];
		value: T;
	}

	let { label, options, value = $bindable() }: Props = $props();
</script>

<label class="contents text-xs text-foreground/60">
	{label}:
	<select class="rounded bg-surface px-1 py-1 text-xs text-foreground" bind:value>
		{#each options as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
</label>
