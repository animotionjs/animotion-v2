<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { getOptions, ASPECT_RATIOS } from '../scene/options.js';
	import EditorScene from './EditorScene.svelte';
	import CanvasEditorScene from '../canvas/CanvasEditorScene.svelte';
	import EditorTimeline from './EditorTimeline.svelte';
	import EditorTransport from './EditorTransport.svelte';
	import EditorMeasureStage from './EditorMeasureStage.svelte';
	import CanvasMeasureStage from '../canvas/CanvasMeasureStage.svelte';
	import EditorSettingsMenu from './EditorSettingsMenu.svelte';
	import RenderButton from '../timeline/RenderButton.svelte';
	import {
		startRender,
		renderStatus,
		cancelRender,
		openRenderFolder
	} from '../timeline/render.remote.js';
	import { EditorController } from './controller.svelte.js';
	import { EditorVoiceover } from './voiceover.svelte.js';
	import { getMeasured, setMeasured } from './measure.js';
	import { buildChapters, chaptersWarning } from './chapters.js';
	import { warmComponents, componentsGeneration } from './components.svelte.js';
	import type { EditorSettings } from './settings.js';
	import type { SceneEntry, Sequence } from '../scene/runtime/sequence.js';
	import type { UiTimeline } from '../canvas/ui.js';

	interface Props {
		/** Ordered scenes laid out on the timeline. */
		sequence: Sequence;
		/** Scene to open on, matching a sequence id. */
		sceneId?: string;
		/** Active project slug. */
		project: string;
	}

	let { sequence, sceneId, project }: Props = $props();

	/*
	 * Editor owned settings, seeded from config. The preview stage, the frame
	 * grid and the render all read this one object, so nothing can drift
	 * between what is shown and what is written.
	 */
	let settings = $state<EditorSettings>({
		aspect: getOptions().aspectRatio.name,
		resolution: getOptions().render.resolution ?? '1080p',
		fps: getOptions().render.fps,
		quality: 'full',
		output: 'video'
	});

	const ratio = $derived(
		ASPECT_RATIOS[settings.aspect].width / ASPECT_RATIOS[settings.aspect].height
	);

	const controller = untrack(() => new EditorController(sequence, settings.fps));
	const voiceover = untrack(() => new EditorVoiceover(controller, project));
	onDestroy(() => {
		voiceover.destroy();
		controller.destroy();
	});

	/*
	 * The controller's rate follows the setting, so the frame grid, the
	 * snapping and every measured block move to the new rate together.
	 */
	$effect(() => {
		controller.setFps(settings.fps);
	});

	/*
	 * Recordings are read over the network, which cannot happen during a
	 * server render, so the track loads once the page is live.
	 */
	$effect(() => {
		voiceover.start();
	});

	/*
	 * The track's length is only known once every scene has measured, so the
	 * audio is relinked as the total grows.
	 */
	$effect(() => {
		if (controller.total > 0) voiceover.relink();
	});

	/*
	 * The clock ticks every frame while playing, which is when the audio needs
	 * following. A paused edit is synced by the effect below.
	 */
	const untick = untrack(() => controller.onTick(() => voiceover.sync()));
	onDestroy(untick);

	$effect(() => {
		// the sync key carries every clock field the audio follows
		const key = controller.syncKey;
		if (key) voiceover.sync();
	});

	/*
	 * Unlocking is only ever granted on a real gesture, and the first frame of
	 * playback can run before the audio context has been resumed. Re-running
	 * the sync on that gesture is what actually starts the narration.
	 */
	$effect(() => {
		if (controller.total > 0) voiceover.unlock();
	});

	// scenes are imported once, and again after an edit replaces their module
	$effect(() => {
		componentsGeneration();
		untrack(() => warmComponents(sequence));
	});

	/*
	 * Scenes to measure off screen, one at a time. A scene already measured at
	 * the current rate is skipped, so navigating back to the editor never
	 * measures twice. A change of rate leaves scenes unmeasured again, and the
	 * effect below re-queues them.
	 */
	let queue = $state<SceneEntry[]>(
		untrack(() => sequence.filter((item) => !getMeasured(item.id, settings.fps)))
	);
	const next = $derived(queue[0]);

	/*
	 * A rate change makes every scene unmeasured for that rate, so any scene
	 * missing at the new rate is queued. Changing back to a rate already
	 * measured queues nothing, because the cache still holds those results.
	 * Scenes already waiting are kept, so a rate change never drops a pending
	 * measurement.
	 */
	$effect(() => {
		const fps = settings.fps;
		const pending = queue;
		const missing = sequence.filter(
			(item) => !getMeasured(item.id, fps) && !pending.some((queued) => queued.id === item.id)
		);
		if (missing.length > 0) queue = [...pending, ...missing];
	});

	/** True once the route's scene has been found, so it is only opened once. */
	let opened = $state(false);

	/*
	 * A scene reports on every mount, so the first result is kept and later
	 * ones are ignored. Writing on every report would redraw the editor, which
	 * would remount the scene that reported and report again.
	 */
	function report(id: string, timeline: UiTimeline, chapter: string) {
		if (!getMeasured(id, settings.fps)) setMeasured(id, settings.fps, timeline, chapter);
		if (queue.some((item) => item.id === id)) {
			queue = queue.filter((item) => item.id !== id);
		}
		controller.refitIfAuto();
		if (opened || !sceneId || id !== sceneId) return;
		opened = true;
		const lane = controller.lanes.find((item) => item.id === id);
		if (lane) controller.seek(lane.start);
	}

	/** Status of the presentation render started from the header. */
	const status = renderStatus();
	let actionError = $state<string | null>(null);
	const renderError = $derived(status.current?.phase === 'failed' ? status.current.error : null);
	const headerError = $derived(actionError ?? renderError);

	function messageOf(error: unknown) {
		if (error instanceof Error) return error.message;
		const body = (error as { body?: { message?: unknown } } | null)?.body;
		return typeof body?.message === 'string' ? body.message : String(error);
	}

	async function render() {
		actionError = null;
		try {
			await startRender({
				scene: null,
				project,
				aspect: settings.aspect,
				resolution: settings.resolution,
				fps: settings.fps,
				quality: settings.quality,
				output: settings.output,
				// the renderer attaches to the dev server serving this page
				origin: location.origin
			});
		} catch (e) {
			actionError = messageOf(e);
		}
	}

	async function reveal() {
		actionError = null;
		try {
			await openRenderFolder(project);
		} catch (e) {
			actionError = messageOf(e);
		}
	}

	/** True once every scene has a measurement, which chapters need. */
	const measured = $derived(
		controller.lanes.length > 0 && controller.lanes.every((lane) => lane.timeline !== null)
	);

	/** The chapter block for the description, or an empty string. */
	const chapters = $derived(
		buildChapters(
			controller.lanes.map((lane) => ({
				id: lane.id,
				title: lane.chapter,
				start: lane.start,
				duration: lane.duration
			}))
		)
	);

	/** A warning about the chapter list, or null when it is ready to paste. */
	const chapterWarning = $derived(
		chaptersWarning(
			controller.lanes.map((lane) => ({
				id: lane.id,
				title: lane.chapter,
				start: lane.start,
				duration: lane.duration
			}))
		)
	);

	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	/*
	 * YouTube chapters go into the video description, so the block is copied
	 * rather than written to a file. A failure falls back to the action error
	 * line, because a blocked clipboard says nothing on its own.
	 */
	async function copyChapters() {
		actionError = null;
		try {
			await navigator.clipboard.writeText(chapters);
			copied = true;
			if (copyTimer !== null) clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 1500);
		} catch (e) {
			actionError = messageOf(e);
		}
	}

	onDestroy(() => {
		if (copyTimer !== null) clearTimeout(copyTimer);
	});

	/*
	 * The scenes on screen: the outgoing one while its exit plays, then the
	 * scene under the playhead. Keyed by id, so a scene that becomes the guest
	 * keeps its manager instead of remounting.
	 */
	const mounted = $derived.by(() => {
		const list: Array<{ id: string; entry: SceneEntry; active: boolean }> = [];
		const guest = controller.guestIndex;
		if (guest !== null) {
			const lane = controller.lanes[guest];
			if (lane) list.push({ id: lane.id, entry: lane.entry, active: false });
		}
		const current = controller.lanes[controller.activeIndex];
		if (current && current.id !== list.at(-1)?.id) {
			list.push({ id: current.id, entry: current.entry, active: true });
		}
		return list;
	});

	// the largest preview box with the configured shape that fits the space
	let boxWidth = $state(0);
	let boxHeight = $state(0);
	const stageWidth = $derived(Math.floor(Math.min(boxWidth, boxHeight * ratio)));
	const stageHeight = $derived(ratio > 0 ? Math.floor(stageWidth / ratio) : 0);
</script>

<div class="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
	<header
		class="relative flex flex-wrap items-center gap-2 border-b border-foreground/10 px-3 py-1 ui-chrome sm:px-4 sm:py-2"
	>
		<div class="ml-auto flex items-center gap-1">
			<RenderButton {status} onstart={render} oncancel={() => cancelRender()} />
			<button
				type="button"
				class="inline-flex cursor-pointer items-center gap-1 rounded bg-surface px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent/40"
				title="open output folder"
				onclick={reveal}
			>
				<svg viewBox="0 0 18 16" class="h-4 w-4" aria-hidden="true">
					<path
						d="M2 4.5c0-.8.7-1.5 1.5-1.5h3l1.5 2h8c.8 0 1.5.7 1.5 1.5v6c0 .8-.7 1.5-1.5 1.5H3.5c-.8 0-1.5-.7-1.5-1.5z"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linejoin="round"
					/>
				</svg>
				open
			</button>
			<button
				type="button"
				class="inline-flex cursor-pointer items-center gap-1 rounded bg-surface px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent/40 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-surface"
				title={chapterWarning ?? 'copy YouTube chapters for the description'}
				disabled={!measured}
				onclick={copyChapters}
			>
				<svg viewBox="0 0 18 16" class="h-4 w-4" aria-hidden="true">
					<path
						d="M3 2.5h7M3 6.5h7M3 10.5h4"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
					<path
						d="M11 7.5h2.5A1.5 1.5 0 0 1 15 9v3.5A1.5 1.5 0 0 1 13.5 14H11a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 11 7.5Z"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linejoin="round"
					/>
				</svg>
				{copied ? 'copied' : 'chapters'}
			</button>
			<EditorSettingsMenu bind:settings />
		</div>

		{#if headerError}
			<p
				class="pointer-events-none absolute top-1/2 left-1/2 max-w-96 -translate-x-1/2 -translate-y-1/2 truncate text-xs text-red-400"
			>
				{headerError}
			</p>
		{/if}
	</header>

	<main class="flex min-h-0 flex-1 items-center justify-center">
		<div
			bind:clientWidth={boxWidth}
			bind:clientHeight={boxHeight}
			class="flex h-full w-full items-center justify-center"
		>
			<!--
				A scene that throws must say so, or the preview is left as an empty
				black box with nothing to explain it.
			-->
			<svelte:boundary>
				<div
					class="relative overflow-hidden shadow-2xl"
					style:width="{stageWidth}px"
					style:height="{stageHeight}px"
					style:background={sequence[0]?.background ?? '#060608'}
				>
					{#each mounted as item (item.id)}
						{#if item.entry.definition}
							<CanvasEditorScene
								entry={item.entry}
								{controller}
								active={item.active}
								onmeasured={report}
							/>
						{:else}
							<EditorScene
								entry={item.entry}
								{ratio}
								{controller}
								active={item.active}
								onmeasured={report}
							/>
						{/if}
					{/each}
				</div>

				{#snippet failed(error)}
					<div class="max-w-md rounded border border-red-500/40 bg-red-950/40 p-4 text-xs">
						<p class="font-medium text-red-200">This scene failed to render</p>
						<pre class="mt-2 overflow-auto text-red-300/80">{error}</pre>
					</div>
				{/snippet}
			</svelte:boundary>
		</div>
	</main>

	<footer class="border-t border-foreground/10 ui-chrome" onpointerdown={() => voiceover.unlock()}>
		<EditorTransport {controller} {voiceover} />
		<EditorTimeline {controller} {voiceover} />
	</footer>

	<!--
		Measurement runs after the visible scene and one scene at a time, so a
		long project fills in its blocks without competing with the preview for
		the main thread.
	-->
	{#if next}
		{#key next.id}
			{#if next.definition}
				<CanvasMeasureStage entry={next} onmeasured={report} />
			{:else}
				<EditorMeasureStage entry={next} onmeasured={report} />
			{/if}
		{/key}
	{/if}
</div>
