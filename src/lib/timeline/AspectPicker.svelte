<script lang="ts">
	import { ASPECT_RATIOS, type AspectRatio } from '../scene/options.js';

	interface Preset {
		name: AspectRatio;
		width: number;
		height: number;
	}

	interface Props {
		value: AspectRatio;
		change: (value: AspectRatio) => void;
	}

	let { value, change }: Props = $props();

	const names = Object.keys(ASPECT_RATIOS) as AspectRatio[];
	const presets = names.map<Preset>((name) => ({ name, ...ASPECT_RATIOS[name] }));
</script>

<div class="flex items-center gap-1" role="group" aria-label="Aspect ratio">
	{#each presets as preset (preset.name)}
		{const selected = $derived(value === preset.name)}
		<button
			type="button"
			class={[
				'rounded px-2 py-1 text-xs',
				{
					'bg-accent/30 text-foreground': selected,
					'text-foreground/60 hover:bg-surface': !selected
				}
			]}
			aria-pressed={selected}
			title="{preset.width} × {preset.height}"
			onclick={() => change(preset.name)}
		>
			{preset.name}
			<span class="ml-1 text-foreground/40">{preset.width}×{preset.height}</span>
		</button>
	{/each}
</div>
