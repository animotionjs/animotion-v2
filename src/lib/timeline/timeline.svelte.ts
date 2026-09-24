import { SvelteSet } from 'svelte/reactivity';
import { clamp } from '../scene/easing';
import { timelineSegments, type SceneManager } from '../scene/runtime/runtime.svelte';

type PlaybackListener = (time: number, playing: boolean) => void;

/**
 * Plays a single scene exactly like the video renderer would. Time advances
 * in whole frames and the scene steps forward whenever it goes idle, which
 * is the same protocol `animotion render` follows, so any playhead position
 * shows the frame the encoder would write there.
 *
 * Positioning always goes through {@link SceneManager.seekToTime} and snaps
 * to the frame grid, so scrubbing, stepping and playback land on identical
 * frames.
 */
export class TimelineController {
	/** Playhead position in seconds, always on the frame grid. */
	time = $state(0);
	playing = $state(false);
	speed = $state(1);
	loop = $state(false);

	#manager: SceneManager;
	#fps: number;
	#rafId: number | null = null;
	#lastNow = 0;
	#accumulator = 0;
	#playbackListeners = new SvelteSet<PlaybackListener>();

	/** Subscribes to playhead updates; returns an unsubscribe function. */
	onPlaybackChange(listener: PlaybackListener) {
		this.#playbackListeners.add(listener);
		return () => this.#playbackListeners.delete(listener);
	}

	#emitPlaybackChange() {
		for (const listener of this.#playbackListeners) listener(this.time, this.playing);
	}

	constructor(manager: SceneManager, fps: number) {
		this.#manager = manager;
		this.#fps = fps > 0 ? fps : 60;
	}

	/** Total seconds of the scene's video timeline. */
	get duration() {
		return this.#manager.timeline.totalDuration;
	}

	/** The scene's segment layout, for drawing the ruler. */
	get timeline() {
		return this.#manager.timeline;
	}

	/** The frame quantum both playback and stepping operate on. */
	get frameDuration() {
		return 1 / this.#fps;
	}

	/** Snaps `seconds` onto the frame grid, clamped to the scene. */
	snap(seconds: number) {
		const frame = Math.round(clamp(seconds, 0, this.duration) * this.#fps);
		/*
		 * One division lands back on the grid instead of accumulating
		 * quantum drift, so the last frame is the exact duration
		 */
		return Math.min(frame / this.#fps, this.duration);
	}

	/** Segment boundary times (scene start, enter end, every step span end). */
	boundaries() {
		const points: number[] = [0];
		for (const segment of timelineSegments(this.timeline)) {
			points.push(segment.start + segment.hold + segment.duration + segment.wait);
		}
		return points;
	}

	/** Pauses (if playing) and jumps to the snapped position. */
	seekTo(seconds: number) {
		this.pause();
		const snapped = this.snap(seconds);
		/*
		 * Scrubbing fires seeks for the same frame over and over, and replaying
		 * the scene up to it is costly, so an unchanged position is a no-op.
		 * Playback drifts off the grid by float dust, so frame indices are
		 * compared instead of raw times.
		 */
		if (Math.round(snapped * this.#fps) === Math.round(this.time * this.#fps)) return;
		this.time = snapped;
		this.#manager.seekToTime(this.time);
		this.#emitPlaybackChange();
	}

	/** Moves the playhead by whole rendered frames. */
	nudge(frames: number) {
		this.seekTo(this.time + frames * this.frameDuration);
	}

	/** Jumps to the previous segment boundary (or the scene start). */
	jumpPrev() {
		const target = [...this.boundaries()].reverse().find((point) => point < this.time - 1e-6);
		this.seekTo(target ?? 0);
	}

	/** Jumps to the next segment boundary (or the scene end). */
	jumpNext() {
		const target = this.boundaries().find((point) => point > this.time + 1e-6);
		this.seekTo(target ?? this.duration);
	}

	toggle() {
		if (this.playing) this.pause();
		else this.play();
	}

	play() {
		if (this.playing || this.duration <= 0) return;
		if (this.time >= this.duration - 1e-6) {
			this.time = 0;
			this.#manager.seekToTime(0);
			this.#emitPlaybackChange();
		}
		this.#startPlayback();
	}

	pause() {
		const wasPlaying = this.playing || this.#rafId !== null;
		if (this.#rafId !== null) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
		}
		this.playing = false;
		if (wasPlaying) this.#emitPlaybackChange();
	}

	destroy() {
		this.pause();
	}

	#startPlayback() {
		this.playing = true;
		this.#lastNow = performance.now();
		this.#accumulator = 0;
		if (this.#rafId === null) this.#rafId = requestAnimationFrame(this.#frame);

		const enterDuration = this.timeline.enterDuration;
		if (this.time < enterDuration) {
			// awaiting playEnter here would start the next step unplayed
			this.#manager.playEnter(enterDuration > 0 ? this.time / enterDuration : 0);
			this.#emitPlaybackChange();
			return;
		}
		/*
		 * Past the enter segment the manager already sits at the playhead from
		 * an earlier seek, so its current step can simply resume.
		 */
		this.#manager.play();
		this.#emitPlaybackChange();
	}

	#frame = (now: number) => {
		this.#rafId = null;
		if (!this.playing) return;

		// ignore huge gaps from tab switches so frames stay exact
		const delta = Math.min((now - this.#lastNow) / 1000, 0.25) * this.speed;
		this.#lastNow = now;
		this.#accumulator += delta;

		const quantum = this.frameDuration;
		while (this.#accumulator >= quantum) {
			this.#accumulator -= quantum;
			this.time = Math.min(this.time + quantum, this.duration);
			const { done } = this.#manager.advanceFrame(quantum);
			if (!done) continue;
			if (this.#manager.finished || this.time >= this.duration) {
				this.#onEnded();
				return;
			}
			this.#manager.next();
		}

		this.#emitPlaybackChange();
		this.#rafId = requestAnimationFrame(this.#frame);
	};

	#onEnded() {
		if (this.loop && this.duration > 0) {
			this.time = 0;
			this.#manager.seekToTime(0);
			this.#emitPlaybackChange();
			this.#startPlayback();
			return;
		}
		// the manager can finish a hair before the playhead reaches the end
		this.time = this.duration;
		this.pause();
	}
}
