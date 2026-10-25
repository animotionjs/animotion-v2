import type { SceneInstance, SceneTimeline, TransitionState } from './scene.js';

/** Timeline shape the existing editor and presentation UI already understand. */
export interface UiTimeline {
	enterDuration: number;
	introHold: number;
	steps: { duration: number; wait: number }[];
	totalDuration: number;
}

const ENTER_DURATION = 0.8;

const IDENTITY_TRANSITION: TransitionState = { opacity: 1, x: 0, y: 0, scale: 1 };

function enterTransition(progress: number): TransitionState {
	return { opacity: progress, x: (1 - progress) * 1920, y: 0, scale: 1 };
}

function exitTransition(progress: number): TransitionState {
	return { opacity: 1 - progress, x: -progress * 1920, y: 0, scale: 1 };
}

export function toUiTimeline(timeline: SceneTimeline): UiTimeline {
	const steps = timeline.steps.map((step) => ({ duration: step.duration, wait: 0 }));
	const stepDuration = steps.reduce((total, step) => total + step.duration, 0);
	return {
		enterDuration: ENTER_DURATION,
		introHold: 0,
		steps,
		totalDuration: ENTER_DURATION + stepDuration
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
	readonly enterDuration = ENTER_DURATION;
	readonly exitDuration = ENTER_DURATION;
	finished = false;
	time = 0;
	#render: ((time: number, transition: TransitionState) => void) | null = null;

	constructor(instance: SceneInstance) {
		this.instance = instance;
	}

	get timeline(): UiTimeline {
		return toUiTimeline(this.instance.timeline);
	}

	setRenderer(render: (time: number, transition: TransitionState) => void) {
		this.#render = render;
		this.#draw(0, enterTransition(1));
	}

	seekToTime(seconds: number) {
		const total = this.enterDuration + this.instance.duration;
		this.time = Math.min(total, Math.max(0, seconds));
		this.finished = this.time >= total;

		if (this.time < this.enterDuration) {
			this.#draw(0, enterTransition(this.time / this.enterDuration));
			return;
		}

		this.#draw(this.time - this.enterDuration, IDENTITY_TRANSITION);
	}

	setEnterProgress(progress: number) {
		this.#draw(0, enterTransition(Math.min(1, Math.max(0, progress))));
	}

	setExitProgress(progress: number) {
		this.#draw(this.instance.duration, exitTransition(Math.min(1, Math.max(0, progress))));
	}

	play() {
		this.finished = false;
	}

	advanceFrame(deltaSeconds: number) {
		this.seekToTime(this.time + deltaSeconds);
		return { done: this.finished };
	}

	next() {
		this.seekToTime(this.enterDuration + this.instance.duration);
	}

	clear() {
		this.#render = null;
	}

	#draw(time: number, transition: TransitionState) {
		this.#render?.(time, transition);
	}
}
