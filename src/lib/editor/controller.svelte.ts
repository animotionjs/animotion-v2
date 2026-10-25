import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { clamp } from '../scene/easing.js';
import { laneAt, layoutLanes, totalDuration, type EditorLane } from './layout.js';
import { measuredChapters, measuredScenes } from './measure.js';
import { clipStartAt } from './move.js';
import type { SceneManager } from '../scene/runtime/runtime.svelte.js';
import type { Sequence } from '../scene/runtime/sequence.js';

/** How much a zoom step changes the pixels per second. */
const ZOOM_STEP = 1.4;
/** Zoom to fall back on before anything is measured, and the zoom ceiling. */
const MIN_PPS = 8;
const MAX_PPS = 4000;

/**
 * Drives the editor like a video editor does. One clock spans the whole
 * presentation, so playback runs from the first scene to the last without
 * pausing at a scene boundary.
 *
 * A scene's own timeline is the truth. Each block covers its enter, hold,
 * steps and waits, and the total is their sum, which is exactly the length a
 * joined render produces.
 *
 * Inside an enter transition the clock positions the incoming scene and the
 * outgoing one by progress, so scrubbing through a boundary shows the real
 * overlap. Inside a scene body the clock advances the scene a frame at a
 * time, which is what keeps playback cheap, since a seek would replay every
 * earlier step.
 */
export class EditorController {
	/** Frame rate the timeline is drawn on. Changing it regrids everything. */
	fps = $state(60);

	/** Playhead position in presentation seconds. */
	time = $state(0);
	/** Whether the clock is running. */
	playing = $state(false);
	/*
	 * Locks the clock while a voiceover is being recorded, so the recording
	 * keeps its place even if a key or a click wants to move the playhead.
	 */
	locked = $state(false);
	/** Whether narration is audible in the preview. */
	voiceover = $state(true);

	/**
	 * Everything the sync depends on, as one reactive read, so a caller can
	 * follow the clock without listing each field.
	 */
	get syncKey(): string {
		return `${this.time}|${this.playing}|${this.locked}|${this.voiceover}`;
	}
	/** Requested horizontal zoom, in pixels per second. */
	pps = $state(240);
	/** Index of the scene on screen. */
	activeIndex = $state(0);
	/** Index of the outgoing scene while its exit plays, or `null`. */
	guestIndex = $state<number | null>(null);

	#viewportWidth = $state(0);
	/*
	 * Whether the timeline still picks its own zoom. A hand picked zoom ends
	 * that, so fitting the whole show happens on its own until asked
	 * otherwise.
	 */
	#autoFit = true;
	#sequence: Sequence;
	#managers = new SvelteMap<string, SceneManager>();
	#rafId: number | null = null;
	#lastNow = 0;
	#accumulator = 0;
	/*
	 * The scene whose body is mid-animation. A scene positioned by a seek
	 * rests at a frame and needs `play` before the clock may advance it.
	 */
	#bodyScene: string | null = null;
	/** The guest whose finished frame has been pinned this handoff. */
	#guestScene: string | null = null;
	#listeners = new SvelteSet<() => void>();

	constructor(sequence: Sequence, fps: number) {
		this.#sequence = sequence;
		this.fps = fps > 0 ? fps : 60;
	}

	/**
	 * Scene blocks, rebuilt whenever a measurement arrives or the frame rate
	 * changes. A plain getter is enough because it reads the reactive
	 * measurement map, so any component that reads it in a reactive context
	 * re-runs when either the measurements or the rate change.
	 */
	get lanes(): EditorLane[] {
		return layoutLanes(this.#sequence, measuredScenes, this.fps, measuredChapters);
	}

	/** Total presentation seconds. */
	get total(): number {
		return totalDuration(this.lanes);
	}

	/** Width of the track viewport, in pixels. Written by the timeline. */
	get viewportWidth(): number {
		return this.#viewportWidth;
	}

	set viewportWidth(value: number) {
		this.#viewportWidth = value;
		// a resize must not leave a fitted timeline scrolled
		this.refitIfAuto();
	}

	/** Subscribes to clock updates for scroll following. */
	onTick(listener: () => void) {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	#emit() {
		for (const listener of this.#listeners) listener();
	}

	/** The frame quantum playback and stepping both operate on. */
	get frameDuration() {
		return 1 / this.fps;
	}

	/** Pixels per second after the fit and ceiling limits are applied. */
	get scale() {
		return clamp(this.pps, this.minZoomPps, MAX_PPS);
	}

	/** Zoom that fits the whole presentation into the viewport. */
	get fitPps() {
		if (this.total <= 0 || this.viewportWidth <= 0) return MIN_PPS;
		return this.viewportWidth / this.total;
	}

	/**
	 * Smallest zoom allowed. Zooming out is always possible below a fit, so
	 * this is a fixed floor rather than the fit value. A tiny presentation
	 * would otherwise be stuck at its own huge fit zoom with no way back.
	 */
	get minZoomPps() {
		return Math.min(MIN_PPS, this.fitPps);
	}

	get contentWidth() {
		return Math.max(this.total * this.scale, this.viewportWidth);
	}

	/** Snaps `seconds` onto the frame grid and clamps it to the presentation. */
	snap(seconds: number) {
		const frame = Math.round(clamp(seconds, 0, this.total) * this.fps);
		// one division lands back on the grid instead of building up drift
		return Math.min(frame / this.fps, this.total);
	}

	/**
	 * Snaps `seconds` onto the frame grid without an upper limit. Voiceover
	 * clips may sit past the end of the presentation, so they are placed by
	 * this rather than by `snap`, which stops at the last scene.
	 */
	snapClip(seconds: number) {
		return clipStartAt(seconds, this.fps);
	}

	/** Presentation seconds at a scroll adjusted pixel offset. */
	timeAtX(x: number) {
		return this.scale > 0 ? x / this.scale : 0;
	}

	/** Scroll adjusted pixel offset for a presentation time. */
	xAtTime(seconds: number) {
		return seconds * this.scale;
	}

	setPps(value: number) {
		// a zoom chosen by hand outranks the automatic fit
		this.#autoFit = false;
		this.pps = clamp(value, this.minZoomPps, MAX_PPS);
		this.#emit();
	}

	/**
	 * Changes the frame rate. The grid, the snapping and every measured block
	 * follow, because they all read `fps`. It returns the scenes now missing a
	 * measurement, so the caller can queue them at the new rate.
	 */
	setFps(fps: number) {
		if (fps <= 0 || fps === this.fps) return;
		this.fps = fps;
		this.time = this.snap(this.time);
		this.#bodyScene = null;
		this.#syncIndices();
		this.refitIfAuto();
		this.#emit();
	}

	zoomIn() {
		this.setPps(this.scale * ZOOM_STEP);
	}

	zoomOut() {
		this.setPps(this.scale / ZOOM_STEP);
	}

	/** Zooms so the whole presentation fills the viewport, and keeps it fitted. */
	zoomToFit() {
		this.#autoFit = true;
		this.refitIfAuto();
	}

	/**
	 * Fits the whole presentation while no zoom has been chosen by hand. Scenes
	 * measure one at a time, so the fit is redone as the total grows.
	 */
	refitIfAuto() {
		if (!this.#autoFit) return;
		if (this.total <= 0 || this.#viewportWidth <= 0) return;
		this.pps = this.fitPps;
		this.#emit();
	}

	/** Mounts a scene's manager and positions it if it is on screen. */
	attach(id: string, manager: SceneManager) {
		this.#managers.set(id, manager);
		const index = this.lanes.findIndex((lane) => lane.id === id);
		if (index === this.activeIndex) this.#positionActive();
		else if (index === this.guestIndex) this.#positionGuest();
	}

	/** Releases a scene's manager when its block leaves the screen. */
	detach(id: string) {
		this.#managers.delete(id);
	}

	/** Pauses and moves the playhead to the snapped position. */
	seek(seconds: number) {
		if (this.locked) return;
		this.pause();
		this.time = this.snap(seconds);
		this.#bodyScene = null;
		this.#syncIndices();
		this.#positionActive();
		this.#positionGuest();
		this.#emit();
	}

	/** Moves the playhead by whole frames. */
	nudge(frames: number) {
		this.seek(this.time + frames * this.frameDuration);
	}

	/** Jumps to the start of the scene before the playhead. */
	previousScene() {
		const { index } = laneAt(this.lanes, this.time - 1e-3);
		const target =
			this.time - (this.lanes[this.activeIndex]?.start ?? 0) > 1e-3 ? this.activeIndex : index;
		const lane = this.lanes[Math.max(0, target)];
		this.seek(lane ? lane.start : 0);
	}

	/** Jumps to the start of the next scene, or the end. */
	nextScene() {
		const next = this.lanes[this.activeIndex + 1];
		this.seek(next ? next.start : this.total);
	}

	toggle() {
		if (this.locked) return;
		if (this.playing) this.pause();
		else this.play();
	}

	/** Freezes the clock while a voiceover is being recorded. */
	lock(value: boolean) {
		this.locked = value;
		if (value) this.pause();
		this.#emit();
	}

	/** Starts the clock. It runs to the end of the presentation. */
	play() {
		if (this.locked || this.playing || this.total <= 0) return;
		if (this.time >= this.total - 1e-6) {
			this.time = 0;
			this.#syncIndices();
			/*
			 * Wrapping to the start must rewind the scene's steps, or the first
			 * frames play the enter transition over the finished pose. The enter
			 * branch of the tick only drives the transition, so it never rewinds
			 * on its own.
			 */
			this.#rewindActive();
		}
		this.playing = true;
		this.#bodyScene = null;
		this.#lastNow = performance.now();
		this.#accumulator = 0;
		if (this.#rafId === null) this.#rafId = requestAnimationFrame(this.#frame);
		this.#emit();
	}

	pause() {
		if (this.#rafId !== null) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
		}
		if (!this.playing) return;
		this.playing = false;
		this.#emit();
	}

	destroy() {
		this.pause();
		this.#listeners.clear();
		this.#managers.clear();
	}

	#frame = (now: number) => {
		this.#rafId = null;
		if (!this.playing) return;

		// ignore huge gaps from tab switches so frames stay exact
		const delta = Math.min((now - this.#lastNow) / 1000, 0.25);
		this.#lastNow = now;
		this.#accumulator += delta;

		const quantum = this.frameDuration;
		while (this.#accumulator >= quantum) {
			this.#accumulator -= quantum;
			if (!this.#tick(quantum)) return;
		}

		this.#emit();
		this.#rafId = requestAnimationFrame(this.#frame);
	};

	/** Advances one frame. Returns false when playback should stop. */
	#tick(quantum: number): boolean {
		const lanes = this.lanes;
		const next = Math.min(this.time + quantum, this.total);
		const target = laneAt(lanes, next);

		if (target.index !== this.activeIndex) {
			this.#beginHandoff(target.index, next);
			return true;
		}

		const lane = lanes[this.activeIndex];
		if (!lane) {
			this.#finish();
			return false;
		}

		const manager = this.#managers.get(lane.id);
		// a scene still mounting holds the clock so no frame is skipped
		if (!manager) return true;

		const enter = lane.timeline?.enterDuration ?? 0;
		const local = this.time - lane.start;

		if (enter > 0 && local < enter) {
			// progress is a pure function of the clock, so a scrub and a play agree
			manager.setEnterProgress(clamp((local + quantum) / enter, 0, 1));
			this.#driveGuest(local + quantum);
		} else {
			if (this.#bodyScene !== lane.id) {
				manager.seekToTime(local);
				manager.play();
				this.#bodyScene = lane.id;
			}
			const { done } = manager.advanceFrame(quantum);
			if (done && !manager.finished) manager.next();
		}

		this.time = next;
		this.#syncIndices();

		if (next >= this.total - 1e-9) {
			this.#finish();
			return false;
		}
		return true;
	}

	/** Cuts over to the next scene, keeping the outgoing one as the guest. */
	#beginHandoff(index: number, next: number) {
		this.guestIndex = this.activeIndex;
		this.activeIndex = index;
		this.time = next;
		this.#bodyScene = null;
		this.#guestScene = null;
		this.#syncIndices();
		this.#positionActive();
		this.#positionGuest();
	}

	/** Recomputes which scenes are on screen for the current playhead. */
	#syncIndices() {
		const lanes = this.lanes;
		const { index } = laneAt(lanes, this.time);
		const lane = lanes[index];
		this.activeIndex = index;
		if (!lane) {
			this.guestIndex = null;
			return;
		}
		const enter = lane.timeline?.enterDuration ?? 0;
		const local = this.time - lane.start;
		const guest = enter > 0 && local < enter && index > 0 ? index - 1 : null;
		this.guestIndex = guest;
		if (guest === null) this.#guestScene = null;
	}

	/** Rewinds the scene on screen to its first frame, enter included. */
	#rewindActive() {
		const lane = this.lanes[this.activeIndex];
		const manager = lane && this.#managers.get(lane.id);
		if (!manager) return;
		manager.seekToTime(0);
		this.#bodyScene = null;
	}

	/** Positions the scene on screen at the current playhead. */
	#positionActive() {
		const lane = this.lanes[this.activeIndex];
		const manager = lane && this.#managers.get(lane.id);
		if (!lane || !manager) return;
		const enter = lane.timeline?.enterDuration ?? 0;
		const local = this.time - lane.start;
		if (enter > 0 && local < enter) {
			/*
			 * The enter branch of the tick only drives the transition, so the
			 * steps must rest at the start or the enter plays over the finished
			 * pose. Rewinding here is what makes a seek and a play agree.
			 */
			manager.seekToTime(0);
			manager.setEnterProgress(clamp(local / enter, 0, 1));
			return;
		}
		// a paused scene rests at the seeked frame, the clock starts it when it runs
		manager.seekToTime(local);
	}

	/** Pins the outgoing scene to its finished frame and drives its exit. */
	#positionGuest() {
		const active = this.lanes[this.activeIndex];
		if (!active) return;
		this.#driveGuest(this.time - active.start);
	}

	#driveGuest(local: number) {
		const index = this.guestIndex;
		if (index === null) return;
		const lane = this.lanes[index];
		const manager = lane && this.#managers.get(lane.id);
		if (!lane || !manager || !manager.loaded) return;

		if (this.#guestScene !== lane.id) {
			/*
			 * The guest leaves from its own last frame. Positioning it at step
			 * 0 instead would rewind any scene with several steps, so it would
			 * jump backwards while it exits.
			 */
			manager.seekToTime(manager.timeline.totalDuration);
			this.#guestScene = lane.id;
		}
		const exit = manager.exitDuration;
		manager.setExitProgress(exit > 0 ? clamp(local / exit, 0, 1) : 1);
	}

	/** Stops at the last frame. */
	#finish() {
		this.time = this.total;
		this.#syncIndices();
		this.#positionActive();
		this.pause();
	}
}
