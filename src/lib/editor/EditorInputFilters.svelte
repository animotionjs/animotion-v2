<script lang="ts">
	import Slider from '../components/Slider.svelte';
	import {
		OBS_EXPANDER_PRESETS,
		VOICEOVER_FILTER_RANGES,
		cloneVoiceoverFilters,
		type ExpanderDetector,
		type ExpanderPreset,
		type VoiceoverFilterSettings
	} from '../voiceover/filters.js';
	import type { EditorVoiceover } from './voiceover.svelte.js';

	interface Props {
		voiceover: EditorVoiceover;
	}

	let { voiceover }: Props = $props();

	// click outside the button and its menu dismisses the popover
	function outsideClick(element: HTMLElement) {
		function onclick(event: MouseEvent) {
			if (event.target instanceof Node && !element.contains(event.target)) open = false;
		}
		window.addEventListener('click', onclick);
		return () => window.removeEventListener('click', onclick);
	}

	let open = $state(false);
	const ranges = VOICEOVER_FILTER_RANGES;
	const locked = $derived(!voiceover.canEditFilters);

	const presetOptions: { value: ExpanderPreset; label: string }[] = [
		{ value: 'expander', label: 'expander' },
		{ value: 'gate', label: 'gate' }
	];
	const detectorOptions: { value: ExpanderDetector; label: string }[] = [
		{ value: 'rms', label: 'RMS' },
		{ value: 'peak', label: 'peak' }
	];

	function patch(edit: (next: VoiceoverFilterSettings) => void) {
		const next = cloneVoiceoverFilters(voiceover.filters);
		edit(next);
		voiceover.updateFilters(next);
	}

	// choosing a preset replaces the shaping values, like the OBS preset button
	function setPreset(preset: ExpanderPreset) {
		const values = OBS_EXPANDER_PRESETS[preset];
		patch((next) => {
			next.expander.preset = preset;
			next.expander.threshold = values.threshold;
			next.expander.ratio = values.ratio;
			next.expander.attack = values.attack;
			next.expander.release = values.release;
			next.expander.outputGain = values.outputGain;
		});
	}
</script>

<div class="relative" title="microphone filters" {@attach outsideClick}>
	<button
		type="button"
		class="inline-flex cursor-pointer items-center gap-1 rounded bg-surface px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent/40"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<svg viewBox="0 0 18 16" class="h-4 w-4" aria-hidden="true">
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
		filters
	</button>

	{#if open}
		<div
			class="filters-menu absolute bottom-full left-0 z-20 mb-1 flex max-h-96 w-72 flex-col gap-4 overflow-y-auto rounded border border-foreground/10 bg-background p-3 shadow-xl"
		>
			{#if locked}
				<p class="text-xs text-foreground/50">filters apply to the next take</p>
			{/if}

			<section class="flex flex-col gap-2">
				<label class="flex items-center gap-2 text-xs text-foreground">
					<input
						type="checkbox"
						checked={voiceover.filters.noiseSuppression.enabled}
						disabled={locked}
						onchange={(e) =>
							patch((next) => {
								next.noiseSuppression.enabled = e.currentTarget.checked;
							})}
					/>
					noise suppression
				</label>
			</section>

			<section class="flex flex-col gap-2">
				<label class="flex items-center gap-2 text-xs text-foreground">
					<input
						type="checkbox"
						checked={voiceover.filters.gain.enabled}
						disabled={locked}
						onchange={(e) =>
							patch((next) => {
								next.gain.enabled = e.currentTarget.checked;
							})}
					/>
					gain
				</label>
				{#if voiceover.filters.gain.enabled}
					<Slider
						label="db"
						unit=" dB"
						min={ranges.gainDb.min}
						max={ranges.gainDb.max}
						step={ranges.gainDb.step}
						value={voiceover.filters.gain.db}
						disabled={locked}
						onchange={(value) =>
							patch((next) => {
								next.gain.db = value;
							})}
					/>
				{/if}
			</section>

			<section class="flex flex-col gap-2">
				<label class="flex items-center gap-2 text-xs text-foreground">
					<input
						type="checkbox"
						checked={voiceover.filters.eq.enabled}
						disabled={locked}
						onchange={(e) =>
							patch((next) => {
								next.eq.enabled = e.currentTarget.checked;
							})}
					/>
					3-band equalizer
				</label>
				{#if voiceover.filters.eq.enabled}
					<Slider
						label="high"
						unit=" dB"
						min={ranges.eqBand.min}
						max={ranges.eqBand.max}
						step={ranges.eqBand.step}
						value={voiceover.filters.eq.high}
						disabled={locked}
						onchange={(value) =>
							patch((next) => {
								next.eq.high = value;
							})}
					/>
					<Slider
						label="mid"
						unit=" dB"
						min={ranges.eqBand.min}
						max={ranges.eqBand.max}
						step={ranges.eqBand.step}
						value={voiceover.filters.eq.mid}
						disabled={locked}
						onchange={(value) =>
							patch((next) => {
								next.eq.mid = value;
							})}
					/>
					<Slider
						label="low"
						unit=" dB"
						min={ranges.eqBand.min}
						max={ranges.eqBand.max}
						step={ranges.eqBand.step}
						value={voiceover.filters.eq.low}
						disabled={locked}
						onchange={(value) =>
							patch((next) => {
								next.eq.low = value;
							})}
					/>
				{/if}
			</section>

			<section class="flex flex-col gap-2">
				<label class="flex items-center gap-2 text-xs text-foreground">
					<input
						type="checkbox"
						checked={voiceover.filters.expander.enabled}
						disabled={locked}
						onchange={(e) =>
							patch((next) => {
								next.expander.enabled = e.currentTarget.checked;
							})}
					/>
					expander
				</label>
				{#if voiceover.filters.expander.enabled}
					<label class="flex items-center justify-between gap-2 text-xs text-foreground/70">
						presets
						<select
							class="rounded bg-surface px-1 py-1 text-xs text-foreground disabled:opacity-50"
							disabled={locked}
							value={voiceover.filters.expander.preset}
							onchange={(e) => setPreset(e.currentTarget.value as ExpanderPreset)}
						>
							{#each presetOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</label>
					<Slider
						label="ratio"
						unit=":1"
						min={ranges.expanderRatio.min}
						max={ranges.expanderRatio.max}
						step={ranges.expanderRatio.step}
						value={voiceover.filters.expander.ratio}
						disabled={locked}
						onchange={(value) =>
							patch((next) => {
								next.expander.ratio = value;
							})}
					/>
					<Slider
						label="threshold"
						unit=" dB"
						min={ranges.threshold.min}
						max={ranges.threshold.max}
						step={ranges.threshold.step}
						value={voiceover.filters.expander.threshold}
						disabled={locked}
						onchange={(value) =>
							patch((next) => {
								next.expander.threshold = value;
							})}
					/>
					<Slider
						label="attack"
						unit=" ms"
						min={ranges.expanderAttackMs.min}
						max={ranges.expanderAttackMs.max}
						step={ranges.expanderAttackMs.step}
						value={voiceover.filters.expander.attack}
						disabled={locked}
						onchange={(value) =>
							patch((next) => {
								next.expander.attack = value;
							})}
					/>
					<Slider
						label="release"
						unit=" ms"
						min={ranges.expanderReleaseMs.min}
						max={ranges.expanderReleaseMs.max}
						step={ranges.expanderReleaseMs.step}
						value={voiceover.filters.expander.release}
						disabled={locked}
						onchange={(value) =>
							patch((next) => {
								next.expander.release = value;
							})}
					/>
					<Slider
						label="output gain"
						unit=" dB"
						min={ranges.outputGainDb.min}
						max={ranges.outputGainDb.max}
						step={ranges.outputGainDb.step}
						value={voiceover.filters.expander.outputGain}
						disabled={locked}
						onchange={(value) =>
							patch((next) => {
								next.expander.outputGain = value;
							})}
					/>
					<label class="flex items-center justify-between gap-2 text-xs text-foreground/70">
						detector
						<select
							class="rounded bg-surface px-1 py-1 text-xs text-foreground disabled:opacity-50"
							disabled={locked}
							value={voiceover.filters.expander.detector}
							onchange={(e) =>
								patch((next) => {
									next.expander.detector = e.currentTarget.value as ExpanderDetector;
								})}
						>
							{#each detectorOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</label>
				{/if}
			</section>

			<section class="flex flex-col gap-2">
				<label class="flex items-center gap-2 text-xs text-foreground">
					<input
						type="checkbox"
						checked={voiceover.filters.compressor.enabled}
						disabled={locked}
						onchange={(e) =>
							patch((next) => {
								next.compressor.enabled = e.currentTarget.checked;
							})}
					/>
					compressor
				</label>
				{#if voiceover.filters.compressor.enabled}
					<Slider
						label="ratio"
						unit=":1"
						min={ranges.compressorRatio.min}
						max={ranges.compressorRatio.max}
						step={ranges.compressorRatio.step}
						value={voiceover.filters.compressor.ratio}
						disabled={locked}
						onchange={(value) =>
							patch((next) => {
								next.compressor.ratio = value;
							})}
					/>
					<Slider
						label="threshold"
						unit=" dB"
						min={ranges.threshold.min}
						max={ranges.threshold.max}
						step={ranges.threshold.step}
						value={voiceover.filters.compressor.threshold}
						disabled={locked}
						onchange={(value) =>
							patch((next) => {
								next.compressor.threshold = value;
							})}
					/>
					<Slider
						label="attack"
						unit=" ms"
						min={ranges.compressorAttackMs.min}
						max={ranges.compressorAttackMs.max}
						step={ranges.compressorAttackMs.step}
						value={voiceover.filters.compressor.attack}
						disabled={locked}
						onchange={(value) =>
							patch((next) => {
								next.compressor.attack = value;
							})}
					/>
					<Slider
						label="release"
						unit=" ms"
						min={ranges.compressorReleaseMs.min}
						max={ranges.compressorReleaseMs.max}
						step={ranges.compressorReleaseMs.step}
						value={voiceover.filters.compressor.release}
						disabled={locked}
						onchange={(value) =>
							patch((next) => {
								next.compressor.release = value;
							})}
					/>
					<Slider
						label="output gain"
						unit=" dB"
						min={ranges.outputGainDb.min}
						max={ranges.outputGainDb.max}
						step={ranges.outputGainDb.step}
						value={voiceover.filters.compressor.outputGain}
						disabled={locked}
						onchange={(value) =>
							patch((next) => {
								next.compressor.outputGain = value;
							})}
					/>
				{/if}
			</section>

			<section class="flex flex-col gap-2">
				<label class="flex items-center gap-2 text-xs text-foreground">
					<input
						type="checkbox"
						checked={voiceover.filters.limiter.enabled}
						disabled={locked}
						onchange={(e) =>
							patch((next) => {
								next.limiter.enabled = e.currentTarget.checked;
							})}
					/>
					limiter
				</label>
				{#if voiceover.filters.limiter.enabled}
					<Slider
						label="threshold"
						unit=" dB"
						min={ranges.limiterThreshold.min}
						max={ranges.limiterThreshold.max}
						step={ranges.limiterThreshold.step}
						value={voiceover.filters.limiter.threshold}
						disabled={locked}
						onchange={(value) =>
							patch((next) => {
								next.limiter.threshold = value;
							})}
					/>
					<Slider
						label="release"
						unit=" ms"
						min={ranges.limiterReleaseMs.min}
						max={ranges.limiterReleaseMs.max}
						step={ranges.limiterReleaseMs.step}
						value={voiceover.filters.limiter.release}
						disabled={locked}
						onchange={(value) =>
							patch((next) => {
								next.limiter.release = value;
							})}
					/>
				{/if}
			</section>

			<button
				type="button"
				class="cursor-pointer rounded bg-surface px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent/40 disabled:cursor-default disabled:opacity-50"
				disabled={locked}
				onclick={() => voiceover.resetFilters()}
			>
				reset to defaults
			</button>
		</div>
	{/if}
</div>

<style>
	/*
	 * The popover scrolls its six filter groups, and the browser default bar
	 * is thick next to the rest of the chrome. The rule carries a class so it
	 * stays scoped to this menu and never reaches a consumer or a scene.
	 */
	.filters-menu {
		scrollbar-width: thin;
		scrollbar-color: color-mix(in oklab, var(--color-foreground) 25%, transparent) transparent;

		&::-webkit-scrollbar {
			width: 0.5rem;
		}

		&::-webkit-scrollbar-track {
			background: transparent;
		}

		&::-webkit-scrollbar-thumb {
			border: 0.125rem solid transparent;
			border-radius: 9999px;
			background-clip: content-box;
			background-color: color-mix(in oklab, var(--color-foreground) 25%, transparent);
		}

		&::-webkit-scrollbar-thumb:hover {
			background-color: color-mix(in oklab, var(--color-foreground) 40%, transparent);
		}
	}
</style>
