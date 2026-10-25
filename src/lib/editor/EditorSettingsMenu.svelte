<script lang="ts">
	import {
		ASPECT_RATIOS,
		RESOLUTIONS,
		type AspectRatio,
		type ResolutionName
	} from '../scene/options.js';
	import Picker from '../timeline/Picker.svelte';
	import type { EditorSettings, EditorQuality } from './settings.js';

	interface Props {
		/** The live settings, edited in place. */
		settings: EditorSettings;
	}

	let { settings = $bindable() }: Props = $props();

	// click outside the gear and its menu dismisses the popover
	function outsideClick(element: HTMLElement) {
		function onclick(event: MouseEvent) {
			if (event.target instanceof Node && !element.contains(event.target)) open = false;
		}
		window.addEventListener('click', onclick);
		return () => window.removeEventListener('click', onclick);
	}

	let open = $state(false);

	const aspectOptions = (Object.keys(ASPECT_RATIOS) as AspectRatio[]).map((name) => ({
		value: name,
		label: name
	}));
	const resolutionOptions = (Object.keys(RESOLUTIONS) as ResolutionName[]).map((name) => ({
		value: name,
		label: name
	}));
	const rateOptions = [
		{ value: 30, label: '30' },
		{ value: 60, label: '60' }
	];
	const qualityOptions: { value: EditorQuality; label: string }[] = [
		{ value: 'full', label: 'full' },
		{ value: 'balanced', label: 'balanced' },
		{ value: 'preview', label: 'preview' }
	];
	const outputOptions = [
		{ value: 'video', label: 'video' },
		{ value: 'images', label: 'images' }
	];
</script>

<div class="relative" title="presentation settings" {@attach outsideClick}>
	<button
		type="button"
		class="inline-flex cursor-pointer items-center gap-1 rounded bg-surface px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent/40"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<svg viewBox="0 0 18 16" class="h-4 w-4" aria-hidden="true">
			<!-- sliders, the standard settings glyph, drawn as rails with a knob each -->
			<path
				d="M2 4.5h3M9 4.5h7"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
			/>
			<circle cx="7" cy="4.5" r="1.75" fill="none" stroke="currentColor" stroke-width="1.5" />
			<path
				d="M2 11.5h7M13 11.5h3"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
			/>
			<circle cx="11" cy="11.5" r="1.75" fill="none" stroke="currentColor" stroke-width="1.5" />
		</svg>
		settings
	</button>

	{#if open}
		<div
			class="absolute right-0 z-20 mt-1 flex w-56 flex-col gap-3 rounded border border-foreground/10 bg-background p-3 shadow-xl"
		>
			<Picker label="aspect" bind:value={settings.aspect} options={aspectOptions} />
			<Picker label="resolution" bind:value={settings.resolution} options={resolutionOptions} />
			<Picker label="fps" bind:value={settings.fps} options={rateOptions} />
			<Picker label="quality" bind:value={settings.quality} options={qualityOptions} />
			<Picker label="output" bind:value={settings.output} options={outputOptions} />
		</div>
	{/if}
</div>
