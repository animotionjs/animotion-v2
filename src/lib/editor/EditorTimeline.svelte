<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { sceneRegions } from './layout.js';
	import { moveDelta, moveLimits } from './move.js';
	import Waveform from './Waveform.svelte';
	import { trimEndEdge, trimStartEdge } from './trim.js';
	import type { VoiceoverTrimLimits } from './trim.js';
	import type { EditorController } from './controller.svelte.js';
	import type { EditorVoiceover } from './voiceover.svelte.js';
	import { voiceoverWindow } from '../voiceover/types.js';
	import type { VoiceoverClip, VoiceoverWindow } from '../voiceover/types.js';

	interface Props {
		/** The clock and scene layout this timeline draws. */
		controller: EditorController;
		/** Voiceover clips drawn on their own row under the scenes. */
		voiceover: EditorVoiceover;
	}

	let { controller, voiceover }: Props = $props();

	// row heights, matched by the gutter so labels line up with their track
	const RULER_HEIGHT = 24;
	const TRACK_HEIGHT = 52;
	const VOICEOVER_HEIGHT = 40;
	// the lane is always drawn, so its purpose is clear before anything is recorded
	const laneHeight = VOICEOVER_HEIGHT;
	// set in pixels because the editor chrome rewrites the spacing scale
	const GUTTER_WIDTH = 96;
	// narrowest a tick label may get before a wider interval is chosen
	const MIN_TICK_PX = 70;

	let viewport = $state<HTMLDivElement | null>(null);
	let content = $state<HTMLDivElement | null>(null);
	let scrubbing = false;
	let scrubX = 0;
	let scrubFrame: number | null = null;
	let clipDrag: {
		id: string;
		pointerId: number;
		grabX: number;
		/** Every dragged clip and the window it held when the drag began. */
		origins: ({ id: string } & VoiceoverWindow)[];
		moved: boolean;
	} | null = null;
	let trimDrag: {
		id: string;
		edge: 'start' | 'end';
		pointerId: number;
		grabX: number;
		origin: VoiceoverWindow;
		limits: VoiceoverTrimLimits;
		moved: boolean;
	} | null = null;
	/*
	 * The label being renamed. The text lives here, not on the clip, so typing
	 * never patches the track and the input keeps its caret.
	 */
	let editingId = $state<string | null>(null);
	let draft = $state('');
	/*
	 * The clip whose label is open, so focus can go back to it when the rename
	 * closes. Without it the focus falls to the body and the delete key stops
	 * reaching the clip that is still selected.
	 */
	let editingElement: HTMLElement | null = null;

	/*
	 * Focuses the rename box the moment it appears and selects the whole name,
	 * so typing replaces it. An `autofocus` attribute would do the same but
	 * warns, and it cannot select.
	 */
	function focusOnMount(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	function tickIntervalFor(scale: number) {
		const candidates = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
		for (const candidate of candidates) {
			if (candidate * scale >= MIN_TICK_PX) return candidate;
		}
		return 120;
	}

	const tickInterval = $derived(tickIntervalFor(controller.scale));

	const ticks = $derived.by(() => {
		const marks: number[] = [];
		if (controller.total <= 0) return marks;
		for (let mark = 0; mark <= controller.total + 1e-6; mark += tickInterval) {
			marks.push(Math.min(mark, controller.total));
		}
		return marks;
	});

	const blocks = $derived.by(() =>
		controller.lanes.map((lane) => ({ lane, regions: sceneRegions(lane) }))
	);

	/*
	 * A clip may be recorded past the end of the presentation, and dragging it
	 * back is how that is fixed. The lane therefore reaches past the last scene
	 * so the overhang stays visible instead of being clipped away. A take still
	 * being captured counts too, so the lane grows with it.
	 */
	const clipEnd = $derived(
		voiceover.clips.reduce((latest, clip) => Math.max(latest, clip.start + clip.duration), 0)
	);
	const liveEnd = $derived.by(() => {
		const live = voiceover.liveClip;
		return live ? live.start + live.duration : 0;
	});
	const laneEnd = $derived(Math.max(controller.total, clipEnd, liveEnd));
	const laneWidth = $derived(Math.max(laneEnd * controller.scale, controller.viewportWidth));

	const playheadX = $derived(controller.xAtTime(controller.time));
	const measuredCount = $derived(controller.lanes.filter((lane) => lane.timeline !== null).length);

	/*
	 * The playhead is followed by scrolling the viewport, never by moving the
	 * content, so the browser keeps the scrollbar and the wheel behaviour.
	 */
	const unsubscribe = untrack(() =>
		controller.onTick(() => {
			const element = viewport;
			if (!element || !controller.playing) return;
			const x = controller.xAtTime(controller.time);
			const left = element.scrollLeft;
			const width = element.clientWidth;
			if (x < left || x > left + width * 0.9) {
				element.scrollLeft = Math.max(0, x - width * 0.15);
			}
		})
	);
	onDestroy(unsubscribe);

	function zoomAt(clientX: number, factor: number) {
		const element = viewport;
		if (!element) return;
		const bounds = element.getBoundingClientRect();
		const cursor = clientX - bounds.left;
		// hold the time under the cursor still while the scale changes
		const anchorTime = (element.scrollLeft + cursor) / controller.scale;
		controller.setPps(controller.scale * factor);
		element.scrollLeft = Math.max(0, anchorTime * controller.scale - cursor);
	}

	function onWheel(event: WheelEvent) {
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		zoomAt(event.clientX, Math.exp(-event.deltaY * 0.0015));
	}

	/** Pixel offset inside the scrolled content for a viewport position. */
	function contentX(clientX: number) {
		const element = content;
		if (!element) return 0;
		return clientX - element.getBoundingClientRect().left;
	}

	function onPointerDown(event: PointerEvent) {
		if (controller.total <= 0) return;
		/*
		 * A click on the timeline background is not a click on a clip. Focus
		 * moves here too, so the clip that held it stops answering the delete
		 * and rename keys, which is what the cleared selection already shows.
		 */
		voiceover.select(null);
		viewport?.focus({ preventScroll: true });
		/*
		 * Capture retargets stray moves to the viewport while the window
		 * handler owns the drag, but a failed grab must never eat the seek.
		 */
		try {
			viewport?.setPointerCapture(event.pointerId);
		} catch {
			// dragging still works without capture
		}
		scrubbing = true;
		scrubX = event.clientX;
		controller.seek(controller.timeAtX(contentX(event.clientX)));
	}

	function onPointerMove(event: PointerEvent) {
		if (!scrubbing) return;
		/*
		 * Moves arrive faster than frames and every seek rebuilds a scene, so
		 * keep only the latest position and seek once per frame.
		 */
		scrubX = event.clientX;
		if (scrubFrame !== null) return;
		scrubFrame = requestAnimationFrame(() => {
			scrubFrame = null;
			if (!scrubbing) return;
			controller.seek(controller.timeAtX(contentX(scrubX)));
		});
	}

	function endScrub(event: PointerEvent) {
		// losing capture mid drag must not end anything, only a real release does
		if (!scrubbing) return;
		scrubbing = false;
		if (scrubFrame !== null) {
			cancelAnimationFrame(scrubFrame);
			scrubFrame = null;
		}
		controller.seek(controller.timeAtX(contentX(event.clientX)));
	}

	/*
	 * A clip drag is tracked with the pointer's starting offset, so the grab
	 * point stays under the cursor and the clip only lands on frame boundaries.
	 * A drag on a clip that is already selected carries the whole selection.
	 */
	function startClipDrag(event: PointerEvent, clip: VoiceoverClip) {
		if (controller.locked) return;
		// a clip must never scrub the playhead on the way to being dragged
		event.stopPropagation();
		// preventDefault below also suppresses the focus a click would normally
		// give, and the clip needs it for delete and rename keys
		event.preventDefault();
		(event.currentTarget as HTMLElement | null)?.focus();

		if (event.shiftKey) {
			// a range drag starts from the last clip that was picked
			const anchor = voiceover.selectedId ?? clip.id;
			voiceover.selectRange(anchor, clip.id);
		} else if (event.metaKey || event.ctrlKey) {
			voiceover.toggle(clip.id);
			return;
		} else if (!voiceover.isSelected(clip.id)) {
			voiceover.focus(clip);
		}

		const origins = voiceover.selection.map((chosen) => ({
			id: chosen.id,
			...voiceoverWindow(chosen)
		}));
		if (!origins.some((origin) => origin.id === clip.id)) {
			origins.push({ id: clip.id, ...voiceoverWindow(clip) });
		}
		clipDrag = {
			id: clip.id,
			pointerId: event.pointerId,
			grabX: event.clientX - controller.xAtTime(clip.start),
			origins,
			moved: false
		};
	}

	function onClipMove(event: PointerEvent) {
		const drag = clipDrag;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const grabbed = drag.origins.find((origin) => origin.id === drag.id);
		if (!grabbed) return;
		const x = event.clientX - drag.grabX;
		const limits = moveLimits(drag.origins, voiceover.clips);
		const delta = moveDelta(controller.timeAtX(x), grabbed.start, controller.fps, limits);
		if (delta === 0 && !drag.moved) return;
		drag.moved = true;
		voiceover.previewMany(
			drag.origins.map((origin) => ({ ...origin, start: origin.start + delta }))
		);
	}

	function endClipDrag(event: PointerEvent) {
		const drag = clipDrag;
		if (!drag || drag.pointerId !== event.pointerId) return;
		clipDrag = null;
		if (!drag.moved) {
			const clip = voiceover.clips.find((item) => item.id === drag.id);
			if (clip && event.type === 'pointerup') controller.seek(clip.start);
			return;
		}
		const windows = drag.origins.map((origin) => {
			const clip = voiceover.clips.find((item) => item.id === origin.id);
			return { id: origin.id, ...(clip ? voiceoverWindow(clip) : origin) };
		});
		void voiceover.commitMany(windows);
	}

	/*
	 * A trim drag moves one edge of the clip. Both edges snap to the frame
	 * grid and are clamped to the recording and the clips either side, so a
	 * preview never matches a window the server would refuse.
	 */
	function startTrimDrag(event: PointerEvent, clip: VoiceoverClip, edge: 'start' | 'end') {
		if (controller.locked) return;
		event.stopPropagation();
		// preventDefault suppresses the focus a click would give, and the clip
		// needs it for the delete and rename keys
		event.preventDefault();
		(event.currentTarget as HTMLElement | null)?.parentElement?.focus();
		voiceover.select(clip.id);
		clipDrag = null;
		const edgeTime = edge === 'start' ? clip.start : clip.start + clip.duration;
		trimDrag = {
			id: clip.id,
			edge,
			pointerId: event.pointerId,
			grabX: event.clientX - controller.xAtTime(edgeTime),
			origin: voiceoverWindow(clip),
			limits: voiceover.trimLimits(clip.id),
			moved: false
		};
	}

	function onTrimMove(event: PointerEvent) {
		const drag = trimDrag;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const current = voiceover.clips.find((item) => item.id === drag.id);
		if (!current) return;
		const edge = controller.snapClip(controller.timeAtX(event.clientX - drag.grabX));
		const next =
			drag.edge === 'start'
				? trimStartEdge(drag.origin, drag.limits, edge)
				: trimEndEdge(drag.origin, drag.limits, edge);
		if (
			next.start === current.start &&
			next.duration === current.duration &&
			next.trimStart === current.trimStart
		) {
			return;
		}
		drag.moved = true;
		voiceover.preview(drag.id, next);
	}

	function endTrimDrag(event: PointerEvent) {
		const drag = trimDrag;
		if (!drag || drag.pointerId !== event.pointerId) return;
		trimDrag = null;
		if (!drag.moved) return;
		const clip = voiceover.clips.find((item) => item.id === drag.id);
		if (!clip) return;
		void voiceover.commit(drag.id, voiceoverWindow(clip));
	}

	function startRename(clip: VoiceoverClip, element: HTMLElement | null = null) {
		if (controller.locked) return;
		// a rename is a name, not a second drag or a seek
		clipDrag = null;
		editingId = clip.id;
		editingElement = element;
		draft = clip.label;
	}

	function commitRename(clip: VoiceoverClip) {
		if (editingId !== clip.id) return;
		const next = draft.trim();
		closeRename();
		if (next === clip.label) return;
		// an empty name is left for the store, so its message explains why
		void voiceover.rename(clip.id, next);
	}

	function cancelRename() {
		closeRename();
	}

	/** Closes the rename box and hands focus back to the clip it belongs to. */
	function closeRename() {
		editingId = null;
		editingElement?.focus();
		editingElement = null;
	}

	/** Nudges every selected clip by one step, as a single undoable move. */
	function nudgeSelection(clip: VoiceoverClip, step: number) {
		const origins = voiceover.selection.map((chosen) => ({
			id: chosen.id,
			...voiceoverWindow(chosen)
		}));
		if (!origins.some((origin) => origin.id === clip.id)) {
			origins.push({ id: clip.id, ...voiceoverWindow(clip) });
		}
		const limits = moveLimits(origins, voiceover.clips);
		const delta = Math.max(limits.min, Math.min(limits.max, step));
		if (delta === 0) return;
		void voiceover.commitMany(
			origins.map((origin) => ({ ...origin, start: origin.start + delta }))
		);
	}

	function onClipKeydown(event: KeyboardEvent, clip: VoiceoverClip) {
		if (controller.locked) return;
		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			const ids = voiceover.isSelected(clip.id)
				? voiceover.selection.map((item) => item.id)
				: [clip.id];
			void voiceover.removeMany(ids);
			return;
		}
		if (event.key === 'Escape') {
			voiceover.select(null);
			return;
		}
		if (event.key === 'F2') {
			event.preventDefault();
			startRename(clip, event.currentTarget as HTMLElement | null);
			return;
		}
		const step = event.shiftKey ? 1 : controller.frameDuration;
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			nudgeSelection(clip, -step);
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			nudgeSelection(clip, step);
		}
	}
	function onWindowPointerMove(event: PointerEvent) {
		onTrimMove(event);
		onClipMove(event);
		onPointerMove(event);
	}

	function onWindowPointerEnd(event: PointerEvent) {
		endTrimDrag(event);
		endClipDrag(event);
		endScrub(event);
	}
</script>

<svelte:window
	onpointermove={onWindowPointerMove}
	onpointerup={onWindowPointerEnd}
	onpointercancel={onWindowPointerEnd}
/>

<div class="flex">
	<div class="shrink-0 border-r border-foreground/10" style:width="{GUTTER_WIDTH}px">
		<div class="flex items-center px-2 text-xs text-foreground/40" style:height="{RULER_HEIGHT}px">
			{measuredCount}/{controller.lanes.length}
		</div>
		<div class="flex items-center px-2 text-xs text-foreground/70" style:height="{TRACK_HEIGHT}px">
			Scenes
		</div>
		<div class="flex items-center px-2 text-xs text-foreground/70" style:height="{laneHeight}px">
			Voiceover
		</div>
	</div>

	<div
		bind:this={viewport}
		bind:clientWidth={controller.viewportWidth}
		class={[
			'relative flex-1 overflow-x-auto overflow-y-hidden',
			'track',
			'select-none',
			controller.total > 0 && 'cursor-ew-resize'
		]}
		role="slider"
		tabindex={controller.total > 0 ? 0 : -1}
		aria-label="Presentation playhead"
		aria-valuemin={0}
		aria-valuemax={controller.total}
		aria-valuenow={controller.time}
		aria-valuetext={`${controller.time.toFixed(2)}s of ${controller.total.toFixed(2)}s`}
		onwheel={onWheel}
		onpointerdown={onPointerDown}
	>
		<!--
			The playhead marker pokes a few pixels past the content, and clipped
			overflow stops it from widening the scroll area, which would show a
			scrollbar for a timeline that already fits.
		-->
		<div bind:this={content} class="relative overflow-x-clip" style:width="{laneWidth}px">
			<div class="relative" style:height="{RULER_HEIGHT}px">
				{#each ticks as tick (tick)}
					<span
						class="absolute top-1/2 -translate-y-1/2 pl-1 text-xs text-foreground/40"
						style:left="{controller.xAtTime(tick)}px"
					>
						{tick.toFixed(tickInterval < 1 ? 2 : 0)}s
					</span>
				{/each}
			</div>

			<div class="relative" style:height="{TRACK_HEIGHT}px">
				{#each blocks as block (block.lane.id)}
					<div
						class="absolute inset-y-1 overflow-hidden rounded border-r border-background/60 bg-surface"
						style:left="{controller.xAtTime(block.lane.start)}px"
						style:width="{Math.max(block.lane.duration * controller.scale, 3)}px"
						title="{block.lane.id}, {block.lane.duration.toFixed(2)}s"
					>
						{#each block.regions as region, index (index)}
							<div
								class={[
									'absolute inset-y-0',
									{
										'bg-accent/25': region.kind === 'enter',
										'bg-accent/15': region.kind === 'step',
										hatch: region.kind === 'hold' || region.kind === 'wait'
									}
								]}
								style:left="{(region.start - block.lane.start) * controller.scale}px"
								style:width="{(region.end - region.start) * controller.scale}px"
							></div>
						{/each}
						{#if block.lane.duration > 0}
							<span class="absolute inset-x-1 top-1 truncate text-xs text-foreground/80">
								{block.lane.id}
							</span>
						{/if}
					</div>
				{/each}

				{#if controller.total <= 0}
					<span class="absolute inset-y-0 left-2 flex items-center text-xs text-foreground/40">
						measuring scenes…
					</span>
				{/if}
			</div>

			<div class="relative" style:height="{laneHeight}px">
				{#each voiceover.clips as clip (clip.id)}
					<div
						role="button"
						tabindex="0"
						class={[
							'absolute inset-y-1 top-0 rounded border transition-colors',
							voiceover.isSelected(clip.id)
								? 'border-accent bg-accent/40'
								: 'border-background/60 bg-accent/20 hover:bg-accent/30'
						]}
						style:left="{controller.xAtTime(clip.start)}px"
						style:width="{Math.max(clip.duration * controller.scale, 3)}px"
						title="{clip.label}, {clip.duration.toFixed(2)}s"
						onpointerdown={(event) => startClipDrag(event, clip)}
						onkeydown={(event) => onClipKeydown(event, clip)}
						ondblclick={(event) => startRename(clip, event.currentTarget as HTMLElement | null)}
					>
						<Waveform
							peaks={voiceover.peaks(clip) ?? []}
							width={Math.max(clip.duration * controller.scale, 3)}
						/>
						<!--
							Trim handles sit on the clip's edges. They are buttons so
							they read as controls, but they are pointer only and left
							out of the tab order, because the clip itself owns the keys.
							They show only for a single selection, because trimming a
							whole group has no one edge to drag.
						-->
						{#if voiceover.selection.length === 1 && voiceover.isSelected(clip.id)}
							<button
								type="button"
								tabindex="-1"
								class="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize touch-none bg-accent/70"
								aria-label={`Trim the start of ${clip.label}`}
								title="drag to trim the start"
								onpointerdown={(event) => startTrimDrag(event, clip, 'start')}
								ondblclick={(event) => event.stopPropagation()}
							></button>
							<button
								type="button"
								tabindex="-1"
								class="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize touch-none bg-accent/70"
								aria-label={`Trim the end of ${clip.label}`}
								title="drag to trim the end"
								onpointerdown={(event) => startTrimDrag(event, clip, 'end')}
								ondblclick={(event) => event.stopPropagation()}
							></button>
						{/if}
						{#if editingId === clip.id}
							<!--
								A solid background, because the label sits over the
								waveform and the text has to stay readable while edited.
							-->
							<input
								class="absolute inset-x-1 top-0 w-[calc(100%-0.5rem)] rounded bg-background px-1 text-xs text-foreground outline-none select-text"
								value={draft}
								use:focusOnMount
								oninput={(event) => (draft = event.currentTarget.value)}
								onkeydown={(event) => {
									event.stopPropagation();
									if (event.key === 'Enter') commitRename(clip);
									else if (event.key === 'Escape') cancelRename();
								}}
								onblur={() => commitRename(clip)}
								onpointerdown={(event) => event.stopPropagation()}
							/>
						{:else}
							<span
								class="pointer-events-none absolute inset-x-1 top-0 truncate text-xs text-foreground/80"
							>
								{clip.label}
							</span>
						{/if}
					</div>
				{/each}

				{#if voiceover.liveClip}
					{@const live = voiceover.liveClip}
					<!--
						The take being captured. It is drawn as a clip so it settles
						into the saved one, but it takes no pointer events because
						there is nothing to drag or select until it is saved.
					-->
					<div
						class="pointer-events-none absolute inset-y-1 top-0 overflow-hidden rounded border border-accent bg-accent/20"
						style:left="{controller.xAtTime(live.start)}px"
						style:width="{Math.max(live.duration * controller.scale, 3)}px"
						title="recording, {live.duration.toFixed(2)}s"
					>
						<Waveform
							peaks={voiceover.liveWaveform}
							width={Math.max(live.duration * controller.scale, 3)}
						/>
						<span class="absolute inset-x-1 top-0 truncate text-xs text-foreground/80">
							{live.label}
						</span>
					</div>
				{/if}
			</div>

			{#if controller.total > 0}
				<!-- one composited element carries the playhead across every row -->
				<div
					class="pointer-events-none absolute inset-y-0 left-0 w-px bg-accent will-change-transform"
					style:transform="translateX({playheadX}px)"
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

	/*
	 * A zoomed timeline is panned with the wheel, so a browser styled scrollbar
	 * only draws a light bar over the scene track. The viewport is focused by a
	 * click so the clip keys have somewhere to land, which would otherwise show
	 * the default focus ring around the whole lane.
	 */
	.track {
		scrollbar-width: none;
		outline: none;
	}

	.track::-webkit-scrollbar {
		display: none;
	}
</style>
