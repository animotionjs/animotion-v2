<script lang="ts">
	import {
		ASPECT_RATIOS,
		RESOLUTIONS,
		type AspectRatio,
		type ResolutionName
	} from '../scene/options.js';
	import Picker from './Picker.svelte';
	import type {
		RenderQuality,
		RenderOutput,
		RenderScope,
		RenderSettings
	} from './render-settings.js';

	interface Props {
		settings: RenderSettings;
	}

	let { settings = $bindable() }: Props = $props();

	let open = $state(false);

	// clicks outside the gear and its menu should dismiss the popover
	function outsideClick(element: HTMLElement) {
		function onclick(event: MouseEvent) {
			if (event.target instanceof Node && !element.contains(event.target)) open = false;
		}
		window.addEventListener('click', onclick);
		return () => window.removeEventListener('click', onclick);
	}

	const aspectOptions = (Object.keys(ASPECT_RATIOS) as AspectRatio[]).map((name) => ({
		value: name,
		label: name
	}));
	const resolutionOptions = (Object.keys(RESOLUTIONS) as ResolutionName[]).map((name) => ({
		value: name,
		label: name
	}));
	const rateOptions = [30, 60].map((value) => ({ value, label: String(value) }));
	const scopeOptions: { value: RenderScope; label: string }[] = [
		{ value: 'scene', label: 'this scene' },
		{ value: 'all', label: 'all scenes' }
	];
	const qualityOptions: { value: RenderQuality; label: string }[] = [
		{ value: 'full', label: 'full' },
		{ value: 'balanced', label: 'balanced' },
		{ value: 'preview', label: 'preview' }
	];
	const outputOptions: { value: RenderOutput; label: string }[] = [
		{ value: 'video', label: 'video' },
		{ value: 'images', label: 'images' }
	];
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') open = false;
	}}
/>

<div {@attach outsideClick} class="relative">
	<button
		type="button"
		class="inline-flex cursor-pointer items-center gap-1 rounded bg-surface px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent/40"
		aria-haspopup="true"
		aria-expanded={open}
		title="render settings"
		onclick={() => (open = !open)}
	>
		<svg viewBox="0 0 24 24" class="h-4 w-4 fill-current" aria-hidden="true">
			<path
				d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
			/>
		</svg>
		settings
	</button>

	{#if open}
		<div
			class="absolute top-full right-0 z-50 mt-1 grid w-56 grid-cols-2 items-center gap-x-3 gap-y-2 rounded border border-foreground/10 bg-background p-3 ui-chrome"
		>
			<Picker label="aspect" bind:value={settings.aspect} options={aspectOptions} />
			<Picker label="resolution" bind:value={settings.resolution} options={resolutionOptions} />
			<Picker label="fps" bind:value={settings.rate} options={rateOptions} />
			<Picker label="scope" bind:value={settings.scope} options={scopeOptions} />
			<Picker label="quality" bind:value={settings.quality} options={qualityOptions} />
			<Picker label="output" bind:value={settings.output} options={outputOptions} />
		</div>
	{/if}
</div>
