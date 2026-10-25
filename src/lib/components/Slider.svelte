<script lang="ts">
	interface Props {
		label: string;
		min: number;
		max: number;
		step: number;
		value: number;
		unit?: string;
		disabled?: boolean;
		onchange?: (value: number) => void;
	}

	let {
		label,
		min,
		max,
		step,
		value = $bindable(),
		unit = '',
		disabled = false,
		onchange
	}: Props = $props();

	function oninput(event: Event) {
		const target = event.target as HTMLInputElement | null;
		if (!target) return;
		// a cleared or autofilled range can report a non number value
		const next = target.valueAsNumber;
		if (!Number.isFinite(next)) return;
		value = next;
		onchange?.(value);
	}
</script>

<label class="flex flex-col gap-1 text-xs text-foreground/70">
	<span class="flex items-baseline justify-between gap-2">
		<span>{label}</span>
		<span class="font-mono text-foreground tabular-nums">{value}{unit}</span>
	</span>
	<input
		type="range"
		{min}
		{max}
		{step}
		{value}
		{disabled}
		class="w-full accent-[var(--color-accent)] disabled:opacity-50"
		{oninput}
	/>
</label>
