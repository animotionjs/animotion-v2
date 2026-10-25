<script lang="ts">
	import { waveformLine } from './waveform.js';
	import type { WaveformPeaks } from './waveform.js';

	interface Props {
		peaks: WaveformPeaks;
		/** The clip's width in pixels, so the line is spread at a readable density. */
		width: number;
	}

	let { peaks, width }: Props = $props();

	/*
	 * The path is built against the clip's real width, so a wide clip draws
	 * more points than a narrow one. It is drawn in a 100 tall box and the view
	 * scales it, so only the width needs to be real.
	 */
	const path = $derived(waveformLine(peaks, Math.max(1, width), 100));
</script>

{#if path}
	<svg
		class="pointer-events-none absolute inset-0 h-full w-full text-foreground/50"
		viewBox="0 0 {Math.max(1, width)} 100"
		preserveAspectRatio="none"
		aria-hidden="true"
	>
		<path
			d={path}
			fill="none"
			stroke="currentColor"
			stroke-width="1"
			stroke-linejoin="round"
			vector-effect="non-scaling-stroke"
		/>
	</svg>
{/if}
