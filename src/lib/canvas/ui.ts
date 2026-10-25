import type { TransitionConfig } from '../scene/options.js';
import type { SceneInstance, SceneTimeline, TransitionState } from './scene.js';
import {
	enterTransition,
	exitTransition,
	resolveTransition,
	type ResolvedTransition
} from './transition.js';

/** Timeline shape the existing editor and presentation UI already understand. */
export interface UiTimeline {
	enterDuration: number;
	introHold: number;
	steps: { duration: number; wait: number }[];
	totalDuration: number;
}

const IDENTITY_TRANSITION: TransitionState = { opacity: 1, x: 0, y: 0, scale: 1 };

export function toUiTimeline(
	timeline: SceneTimeline,
	config?: TransitionConfig | null
): UiTimeline {
	const steps = timeline.steps.map((step) => ({ duration: step.duration, wait: 0 }));
	const stepDuration = steps.reduce((total, step) => total + step.duration, 0);
	const transition = resolveTransition(config);
	const enterDuration = transition?.duration ?? 0;
	return {
		enterDuration,
		introHold: 0,
		steps,
		totalDuration: enterDuration + stepDuration
	};
}

/** Playback surface the existing editor clock drives. */
export interface UiScenePlayback {
	readonly loaded: boolean;
	readonly finished: boolean;
	readonly timeline: UiTimeline;
	readonly enterDuration: number;
	readonly exitDuration: number;
	seekToTime(seconds: number): void;
	setEnterProgress(progress: number): void;
	setExitProgress(progress: number): void;
	play(): void;
	pause?(): void;
	setDirection?(direction: 'forward' | 'backward'): void;
	advanceFrame(deltaSeconds: number): { done: boolean };
	next(): void;
}

/**
 * Drives a canvas scene from the existing editor clock. The editor owns time
 * and only needs a scene that can be positioned and drawn.
 */
export class CanvasSceneManager implements UiScenePlayback {
	readonly instance: SceneInstance;
	readonly loaded = true;
	readonly transition: ResolvedTransition | null;
	readonly enterDuration: number;
	readonly exitDuration: number;
	finished = false;
	time = 0;
	#width: number;
	#lastTime = 0;
	#lastTransition: TransitionState = IDENTITY_TRANSITION;
	#playing = false;
	#direction: 'forward' | 'backward' = 'forward';
	#render: ((time: number, transition: TransitionState, playing: boolean) => void) | null = null;

	constructor(instance: SceneInstance, width = 1920, transition?: TransitionConfig | null) {
		this.instance = instance;
		this.#width = width;
		this.transition = resolveTransition(transition);
		this.enterDuration = this.transition?.duration ?? 0;
		this.exitDuration = this.transition?.duration ?? 0;
	}

	get timeline(): UiTimeline {
		return toUiTimeline(this.instance.timeline, this.transition);
	}

	setDirection(direction: 'forward' | 'backward') {
		this.#direction = direction;
	}

	setRenderer(render: (time: number, transition: TransitionState, playing: boolean) => void) {
		this.#render = render;
		this.#draw(0, this.#enterState(1), false);
	}

	seekToTime(seconds: number) {
		this.#playing = false;
		const total = this.enterDuration + this.instance.duration;
		this.time = Math.min(total, Math.max(0, seconds));
		this.finished = this.time >= total;

		if (this.time < this.enterDuration) {
			this.#draw(0, this.#enterState(this.time / this.enterDuration), false);
			return;
		}

		this.#draw(this.time - this.enterDuration, IDENTITY_TRANSITION, false);
	}

	setEnterProgress(progress: number) {
		this.#playing = false;
		this.#draw(0, this.#enterState(Math.min(1, Math.max(0, progress))), false);
	}

	setExitProgress(progress: number) {
		this.#playing = false;
		this.#draw(this.instance.duration, this.#exitState(Math.min(1, Math.max(0, progress))), false);
	}

	play() {
		this.finished = false;
		this.#playing = true;
	}

	pause() {
		this.#playing = false;
		this.#draw(this.#lastTime, this.#lastTransition, false);
	}

	advanceFrame(deltaSeconds: number) {
		this.#playing = true;
		this.seekToTimeInternal(this.time + deltaSeconds);
		return { done: this.finished };
	}

	next() {
		this.seekToTime(this.enterDuration + this.instance.duration);
	}

	redraw() {
		this.#render?.(this.#lastTime, this.#lastTransition, this.#playing);
	}

	clear() {
		this.#render = null;
	}

	/** Advances time without the pause that a public seek implies. */
	seekToTimeInternal(seconds: number) {
		const total = this.enterDuration + this.instance.duration;
		this.time = Math.min(total, Math.max(0, seconds));
		this.finished = this.time >= total;

		if (this.time < this.enterDuration) {
			this.#draw(0, this.#enterState(this.time / this.enterDuration), true);
			return;
		}

		this.#draw(this.time - this.enterDuration, IDENTITY_TRANSITION, true);
	}

	#enterState(progress: number): TransitionState {
		return enterTransition(this.transition, progress, this.#width, this.#direction);
	}

	#exitState(progress: number): TransitionState {
		return exitTransition(this.transition, progress, this.#width, this.#direction);
	}

	#draw(time: number, transition: TransitionState, playing: boolean) {
		this.#lastTime = time;
		this.#lastTransition = transition;
		this.#playing = playing;
		this.#render?.(time, transition, playing);
	}
}
