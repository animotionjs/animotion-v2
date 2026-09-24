<script lang="ts">
	import { timelineSegments } from '../scene/runtime/runtime.svelte.js';
	import { voiceoverOverlaps, type VoiceoverClip } from '../voiceover/types.js';
	import type { TimelineController } from './timeline.svelte.js';

	interface Segment {
		kind: 'enter' | 'step';
		label: string;
		start: number;
		hold: number;
		duration: number;
		wait: number;
	}

	interface Props {
		controller: TimelineController;
		voiceovers?: readonly VoiceoverClip[];
		selectedVoiceoverId?: string | null;
		voiceoverError?: string | null;
		voiceoverBusy?: boolean;
		disabled?: boolean;
		onselectvoiceover?: (id: string) => void;
		onmovevoiceover?: (id: string, start: number) => void;
		oninvalidvoiceover?: () => void;
		ondeletevoiceover?: (id: string) => void;
	}

	let {
		controller,
		voiceovers = [],
		selectedVoiceoverId = null,
		voiceoverError = null,
		voiceoverBusy = false,
		disabled = false,
		onselectvoiceover = () => {},
		onmovevoiceover = () => {},
		oninvalidvoiceover = () => {},
		ondeletevoiceover = () => {}
	}: Props = $props();

	let trackElement: HTMLDivElement | null = null;
	let scrubElement: HTMLDivElement | null = null;
	let trackWidth = $state(0);
	let scrubbing = false;
	let scrubClientX = 0;
	let scrubFrame: number | null = null;
	let dragId = $state<string | null>(null);
	let dragPointerId: number | null = null;
	let dragStartX = 0;
	let dragGrabOffset = 0;
	let dragOriginalStart = 0;
	let dragPreviewStart = $state<number | null>(null);
	let dragMoved = false;
	let dragInvalid = $state(false);

	const duration = $derived(controller.duration);
	const timeline = $derived(controller.timeline);
	const playheadLeft = $derived(duration > 0 ? (controller.time / duration) * 100 : 0);

	const segments = $derived.by<Segment[]>(() => {
		if (duration <= 0) return [];
		const hasEnter = timeline.enterDuration > 0;
		return timelineSegments(timeline).map((segment, position) => {
			const index = position - (hasEnter ? 1 : 0) + 1;
			return {
				kind: segment.enter ? ('enter' as const) : ('step' as const),
				label: segment.enter ? 'enter' : String(index),
				start: segment.start,
				hold: segment.hold,
				duration: segment.duration,
				wait: segment.wait
			};
		});
	});

	const WAVEFORM_BARS = Array.from({ length: 18 }, (_, index) => index);
	const TICK_CANDIDATES = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
	const MAX_TICKS = 10;
	const FALLBACK_TICK_SECONDS = 120;
	const FLOAT_TOLERANCE = 1e-6;

	const tickInterval = $derived.by(() => {
		for (const candidate of TICK_CANDIDATES) {
			if (duration / candidate <= MAX_TICKS) return candidate;
		}
		return FALLBACK_TICK_SECONDS;
	});

	const ticks = $derived.by(() => {
		const marks: number[] = [];
		for (let time = 0; time <= duration + FLOAT_TOLERANCE; time += tickInterval) {
			marks.push(Math.min(time, duration));
		}
		return marks;
	});

	const MIN_TICK_GAP_PX = 30;
	const showTickLabels = $derived(
		trackWidth <= 0 || duration <= 0
			? true
			: (tickInterval / duration) * trackWidth >= MIN_TICK_GAP_PX
	);

	function describeSegment(segment: Segment) {
		if (segment.kind === 'enter') return `Enter transition — ${segment.duration.toFixed(2)}s`;
		const parts = [`Step ${segment.label} — ${segment.duration.toFixed(2)}s`];
		if (segment.hold > 0) parts.push(`hold ${segment.hold.toFixed(2)}s`);
		if (segment.wait > 0) parts.push(`wait ${segment.wait.toFixed(2)}s`);
		return parts.join(', ');
	}

	function attachTrack(element: HTMLDivElement) {
		trackElement = element;
		return () => {
			trackElement = null;
			if (scrubFrame !== null) cancelAnimationFrame(scrubFrame);
		};
	}

	function attachSlider(element: HTMLDivElement) {
		scrubElement = element;
		return () => {
			scrubElement = null;
		};
	}

	function timeAt(clientX: number) {
		const element = scrubElement ?? trackElement;
		if (!element || duration <= 0) return controller.time;
		const bounds = element.getBoundingClientRect();
		return ((clientX - bounds.left) / bounds.width) * duration;
	}

	function startScrub(event: PointerEvent) {
		const element = scrubElement ?? trackElement;
		if (!element || duration <= 0 || disabled) return;
		try {
			element.setPointerCapture(event.pointerId);
		} catch {
			// seeking works fine without capture
		}
		scrubClientX = event.clientX;
		scrubbing = true;
		controller.seekTo(controller.snap(timeAt(event.clientX)));
	}

	function onPointerDown(event: PointerEvent) {
		startScrub(event);
	}

	function onVoiceoverBackgroundPointerDown(event: PointerEvent) {
		event.stopPropagation();
		startScrub(event);
	}

	function onPointerMove(event: PointerEvent) {
		if (scrubbing) {
			scrubClientX = event.clientX;
			if (scrubFrame !== null) return;
			scrubFrame = requestAnimationFrame(() => {
				scrubFrame = null;
				if (!scrubbing || !trackElement) return;
				controller.seekTo(controller.snap(timeAt(scrubClientX)));
			});
			return;
		}
		if (dragId === null || dragPointerId !== event.pointerId) return;
		const clip = voiceovers.find((item) => item.id === dragId);
		if (!clip) return;
		if (Math.abs(event.clientX - dragStartX) > 3) dragMoved = true;
		const latest = controller.snap(timeAt(event.clientX) - dragGrabOffset);
		dragPreviewStart = Math.max(0, Math.min(duration - clip.duration, latest));
		dragInvalid = voiceovers.some(
			(other) =>
				other.id !== clip.id &&
				voiceoverOverlaps({ start: dragPreviewStart ?? clip.start, duration: clip.duration }, other)
		);
	}

	function startClipDrag(event: PointerEvent, clip: VoiceoverClip) {
		if (disabled || voiceoverBusy) return;
		event.stopPropagation();
		try {
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		} catch {
			// dragging still works without capture
		}
		dragId = clip.id;
		dragPointerId = event.pointerId;
		dragStartX = event.clientX;
		dragGrabOffset = timeAt(event.clientX) - clip.start;
		dragOriginalStart = clip.start;
		dragPreviewStart = clip.start;
		dragMoved = false;
		dragInvalid = false;
	}

	function endScrub(event: PointerEvent) {
		if (scrubbing) {
			scrubbing = false;
			if (scrubFrame !== null) {
				cancelAnimationFrame(scrubFrame);
				scrubFrame = null;
			}
			if ((scrubElement ?? trackElement) && duration > 0) {
				controller.seekTo(controller.snap(timeAt(event.clientX)));
			}
			return;
		}

		if (dragId === null || dragPointerId !== event.pointerId) return;
		const clip = voiceovers.find((item) => item.id === dragId);
		const candidate = dragPreviewStart ?? dragOriginalStart;
		const moved = dragMoved;
		const invalid = dragInvalid;
		dragId = null;
		dragPointerId = null;
		dragPreviewStart = null;
		dragMoved = false;
		dragInvalid = false;
		if (!clip) return;
		if (!moved) {
			onselectvoiceover(clip.id);
			return;
		}
		if (invalid) oninvalidvoiceover();
		else onmovevoiceover(clip.id, candidate);
	}

	function cancelPointer() {
		scrubbing = false;
		if (scrubFrame !== null) {
			cancelAnimationFrame(scrubFrame);
			scrubFrame = null;
		}
		dragId = null;
		dragPointerId = null;
		dragPreviewStart = null;
		dragMoved = false;
		dragInvalid = false;
	}

	function displayStart(clip: VoiceoverClip) {
		return dragId === clip.id && dragPreviewStart !== null ? dragPreviewStart : clip.start;
	}

	function clipStyle(clip: VoiceoverClip) {
		const start = displayStart(clip);
		return `left:${duration > 0 ? (start / duration) * 100 : 0}%;width:${
			duration > 0 ? (clip.duration / duration) * 100 : 0
		}%`;
	}

	function clipKey(event: KeyboardEvent, clip: VoiceoverClip) {
		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			ondeletevoiceover(clip.id);
			return;
		}
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			if (disabled || voiceoverBusy) return;
			const direction = event.key === 'ArrowLeft' ? -1 : 1;
			const start = Math.max(
				0,
				Math.min(
					duration - clip.duration,
					controller.snap(clip.start + direction * controller.frameDuration)
				)
			);
			const invalid = voiceovers.some(
				(other) =>
					other.id !== clip.id && voiceoverOverlaps({ start, duration: clip.duration }, other)
			);
			if (invalid) oninvalidvoiceover();
			else onmovevoiceover(clip.id, start);
			return;
		}
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		onselectvoiceover(clip.id);
	}
</script>

<svelte:window
	onpointermove={onPointerMove}
	onpointerup={endScrub}
	onpointercancel={cancelPointer}
/>

<div class="px-3 pb-2 sm:px-4 sm:pb-3">
	<div
		class="mb-1 flex min-h-5 items-center gap-2 text-[10px] tracking-wide text-foreground/50 uppercase"
	>
		<span>voiceover</span>
		{#if selectedVoiceoverId !== null}
			<span class="truncate tracking-normal text-foreground/70 normal-case">
				{voiceovers.find((clip) => clip.id === selectedVoiceoverId)?.label}
			</span>
			<button
				type="button"
				class="ml-auto cursor-pointer rounded px-1.5 py-0.5 tracking-normal text-foreground/60 normal-case hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40"
				disabled={voiceoverBusy || disabled}
				aria-label="Delete selected voiceover recording"
				onclick={() => ondeletevoiceover(selectedVoiceoverId)}
			>
				delete
			</button>
		{/if}
		{#if voiceoverBusy}
			<span class="ml-auto tracking-normal text-foreground/50 normal-case" aria-live="polite"
				>saving...</span
			>
		{/if}
	</div>

	<div
		{@attach attachTrack}
		bind:clientWidth={trackWidth}
		class={['relative h-16 touch-none select-none', disabled && 'pointer-events-none opacity-70']}
	>
		<div
			{@attach attachSlider}
			class="absolute inset-x-0 top-0 h-6 cursor-ew-resize rounded bg-surface"
			role="slider"
			tabindex={duration > 0 && !disabled ? 0 : -1}
			aria-disabled={disabled}
			aria-label="Scene playhead"
			aria-valuemin={0}
			aria-valuemax={duration}
			aria-valuenow={controller.time}
			aria-valuetext={`${controller.time.toFixed(2)}s of ${duration.toFixed(2)}s`}
			onpointerdown={onPointerDown}
		>
			<div class="absolute inset-0 flex items-stretch overflow-hidden rounded">
				{#each segments as segment, index (index)}
					{@const enter = segment.kind === 'enter'}
					{@const span = segment.hold + segment.duration + segment.wait}
					<div
						class="group relative border-r border-background/60 last:border-r-0"
						style:width="{duration > 0 ? (span / duration) * 100 : 0}%"
						style:min-width="2px"
						title={describeSegment(segment)}
					>
						<div
							class={['absolute inset-0', { 'bg-accent/25': enter, 'bg-accent/15': !enter }]}
						></div>
						{#if segment.hold > 0}
							<div
								class="hatch absolute inset-y-0 left-0"
								style:width="{(segment.hold / span) * 100}%"
							></div>
						{/if}
						{#if segment.wait > 0}
							<div
								class="hatch absolute inset-y-0 right-0"
								style:width="{(segment.wait / span) * 100}%"
							></div>
						{/if}
						<span
							class="absolute inset-0 flex items-center justify-center text-xs font-medium text-foreground/70"
						>
							{segment.label}
						</span>
					</div>
				{/each}
				{#if duration <= 0}
					<span
						class="absolute inset-0 flex items-center justify-center text-xs text-foreground/50"
					>
						This scene has no steps.
					</span>
				{/if}
			</div>
		</div>

		<div
			class="absolute inset-x-0 top-7 h-6 overflow-hidden rounded border border-foreground/10 bg-surface/70"
			role="group"
			aria-label="Voiceover track"
			onpointerdown={onVoiceoverBackgroundPointerDown}
		>
			{#each voiceovers as clip (clip.id)}
				{@const invalid = dragId === clip.id && dragInvalid}
				<button
					type="button"
					class={[
						'absolute inset-y-0 min-w-2 cursor-grab overflow-hidden rounded border px-1 text-left text-[10px] text-foreground/80 transition-colors active:cursor-grabbing',
						selectedVoiceoverId === clip.id
							? 'border-accent bg-accent/30'
							: 'border-accent/30 bg-accent/15 hover:bg-accent/25',
						invalid && 'border-red-400 bg-red-500/20'
					]}
					style={clipStyle(clip)}
					disabled={voiceoverBusy || disabled}
					aria-label={`Voiceover recording ${clip.label}, starts at ${clip.start.toFixed(2)} seconds, duration ${clip.duration.toFixed(2)} seconds`}
					title={`${clip.label} — ${clip.start.toFixed(2)}s, ${clip.duration.toFixed(2)}s`}
					onpointerdown={(event) => startClipDrag(event, clip)}
					onkeydown={(event) => clipKey(event, clip)}
				>
					<span class="relative z-10 block truncate">{clip.label}</span>
					<span
						class="pointer-events-none absolute inset-x-1 bottom-1 flex h-2 items-end gap-px opacity-60"
					>
						{#each WAVEFORM_BARS as bar (bar)}
							<span
								class="min-w-px flex-1 bg-current"
								style:height={`${25 + ((bar * 37 + clip.id.length * 13) % 70)}%`}
							></span>
						{/each}
					</span>
				</button>
			{/each}
			{#if voiceovers.length === 0}
				<span class="absolute inset-0 flex items-center justify-center text-xs text-foreground/40">
					No voiceover recordings
				</span>
			{/if}
		</div>

		{#if duration > 0}
			{#each ticks as tick (tick)}
				{#if showTickLabels}
					<div
						class="absolute top-14 text-xs text-foreground/40"
						style:left="{(tick / duration) * 100}%"
					>
						{tick.toFixed(tickInterval < 1 ? 2 : 0)}s
					</div>
				{/if}
			{/each}

			<div
				class="pointer-events-none absolute inset-y-0 w-px bg-accent"
				style:left="{playheadLeft}%"
			>
				<svg
					viewBox="0 0 9 6"
					class="absolute top-0 left-[-4px] h-[6px] w-[9px] fill-accent"
					aria-hidden="true"
				>
					<path d="M0 0h9L4.5 6z" />
				</svg>
			</div>
		{/if}
	</div>

	{#if voiceoverError !== null}
		<p class="mt-1 text-xs text-red-400" role="alert">{voiceoverError}</p>
	{/if}
</div>

<style>
	.hatch {
		background: repeating-linear-gradient(
			45deg,
			transparent 0 3px,
			rgba(255, 255, 255, 0.09) 3px 6px
		);
	}
</style>
