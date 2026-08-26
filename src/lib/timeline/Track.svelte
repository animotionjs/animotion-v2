<script lang="ts">
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
	}

	let { controller }: Props = $props();

	let trackElement: HTMLDivElement | null = null;
	let scrubbing = $state(false);

	const duration = $derived(controller.duration);
	const timeline = $derived(controller.timeline);

	const segments = $derived.by<Segment[]>(() => {
		if (duration <= 0) return [];
		const list: Segment[] = [];
		if (timeline.enterDuration > 0) {
			list.push({
				kind: 'enter',
				label: 'enter',
				start: 0,
				hold: 0,
				duration: timeline.enterDuration,
				wait: 0
			});
		}
		let cursor = timeline.enterDuration;
		timeline.steps.forEach((step, index) => {
			const hold = index === 0 ? timeline.introHold : 0;
			list.push({
				kind: 'step',
				label: String(index + 1),
				start: cursor,
				hold,
				duration: step.duration,
				wait: step.wait
			});
			cursor += hold + step.duration + step.wait;
		});
		return list;
	});

	// a ladder of round intervals keeps the ruler readable for any scene length
	const TICK_CANDIDATES = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
	const MAX_TICKS = 10;
	const FALLBACK_TICK_SECONDS = 120;

	// pick the smallest interval that keeps the tick count manageable
	const tickInterval = $derived.by(() => {
		for (const candidate of TICK_CANDIDATES) {
			if (duration / candidate <= MAX_TICKS) return candidate;
		}
		return FALLBACK_TICK_SECONDS;
	});

	// float drift can skip the final mark, so clamp every mark to the end
	const FLOAT_TOLERANCE = 1e-6;

	const ticks = $derived.by(() => {
		const marks: number[] = [];
		for (let t = 0; t <= duration + FLOAT_TOLERANCE; t += tickInterval)
			marks.push(Math.min(t, duration));
		return marks;
	});

	const playheadLeft = $derived(duration > 0 ? (controller.time / duration) * 100 : 0);

	function describeSegment(segment: Segment) {
		if (segment.kind === 'enter') return `Enter transition — ${segment.duration.toFixed(2)}s`;
		const parts = [`Step ${segment.label} — ${segment.duration.toFixed(2)}s`];
		if (segment.hold > 0) parts.push(`hold ${segment.hold.toFixed(2)}s`);
		if (segment.wait > 0) parts.push(`wait ${segment.wait.toFixed(2)}s`);
		return parts.join(', ');
	}

	function attachTrack(element: HTMLDivElement) {
		trackElement = element;
		return () => (trackElement = null);
	}

	function timeAt(clientX: number) {
		const element = trackElement;
		if (!element || duration <= 0) return controller.time;
		const bounds = element.getBoundingClientRect();
		const fraction = (clientX - bounds.left) / bounds.width;
		return controller.snap(fraction * duration);
	}

	function onPointerDown(event: PointerEvent) {
		if (!trackElement || duration <= 0) return;
		scrubbing = true;
		trackElement.setPointerCapture(event.pointerId);
		controller.seekTo(timeAt(event.clientX));
	}

	function onPointerMove(event: PointerEvent) {
		if (!scrubbing) return;
		controller.seekTo(timeAt(event.clientX));
	}

	function onPointerUp() {
		scrubbing = false;
	}
</script>

<div class="px-4 pb-3">
	<div
		{@attach attachTrack}
		class={['relative h-12 cursor-ew-resize touch-none select-none', duration <= 0 && 'opacity-50']}
		role="slider"
		tabindex={0}
		aria-label="Scene playhead"
		aria-valuemin={0}
		aria-valuemax={duration}
		aria-valuenow={controller.time}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
	>
		<div class="absolute inset-x-0 top-3 flex h-6 items-stretch overflow-hidden rounded bg-surface">
			{#each segments as segment (segment.start)}
				{const enter = segment.kind === 'enter'}
				{const span = segment.hold + segment.duration + segment.wait}
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
						class="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-foreground/70"
					>
						{segment.label}
					</span>
				</div>
			{/each}
			{#if duration <= 0}
				<span class="absolute inset-0 flex items-center justify-center text-xs text-foreground/50">
					This scene has no steps.
				</span>
			{/if}
		</div>

		{#if duration > 0}
			{#each ticks as tick (tick)}
				<div
					class="absolute top-9 text-[10px] text-foreground/40"
					style:left="{(tick / duration) * 100}%"
				>
					{tick.toFixed(tickInterval < 1 ? 2 : 0)}s
				</div>
			{/each}

			<div
				class="pointer-events-none absolute inset-y-0 w-px bg-accent"
				style:left="{playheadLeft}%"
			>
				<div
					class="absolute top-0 left-[-3.5px] h-0 w-0 border-x-[3.5px] border-t-[5px] border-x-transparent border-t-accent"
				></div>
			</div>
		{/if}
	</div>
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
