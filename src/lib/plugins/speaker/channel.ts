/** One scene in the speaker outline. */
export interface SpeakerScene {
	id: string;
}

/**
 * Snapshot of the presentation broadcast to the speaker view. Sent whenever
 * the active scene or step changes, and on request (see `hello`).
 */
export interface SpeakerState {
	/** Active scene id. */
	sceneId: string;
	/** Index of the active scene in the sequence. */
	sceneIndex: number;
	/** Total number of scenes. */
	totalScenes: number;
	/** Index of the current step within the active scene. */
	step: number;
	/** Total steps in the active scene. */
	totalSteps: number;
	/** Whether the current step's animation has fully played. */
	stepCompleted: boolean;
	/** Whether the active scene has played all its steps. */
	finished: boolean;
	/** Slide aspect ratio, for scaling the previews. */
	aspectRatio: { width: number; height: number };
	/** Every scene, for the outline. */
	scenes: SpeakerScene[];
	/** Current scene's notes markup, from its hidden `[data-notes]` box. */
	notes?: string;
}

/** A command sent from the speaker view to the presentation. */
export type SpeakerCommand =
	| { type: 'next' }
	| { type: 'prev' }
	| { type: 'goto'; id: string }
	/** Requests a fresh `state` broadcast, e.g. when the speaker view opens. */
	| { type: 'hello' };

/** Message exchanged between the presentation and the speaker view. */
export type SpeakerMessage = { type: 'state'; state: SpeakerState } | SpeakerCommand;

/** Default name of the `BroadcastChannel` the two windows share. */
export const SPEAKER_CHANNEL = 'animotion:speaker';

/**
 * Wraps the `BroadcastChannel` shared between the presentation window and the
 * speaker view. One instance per window: the presentation sends `state` and
 * receives commands; the speaker view sends commands and receives `state`.
 */
export class SpeakerChannel {
	#channel: BroadcastChannel;
	/** Invoked with each message received from the other window. */
	onmessage: ((message: SpeakerMessage) => void) | null = null;

	constructor(name: string = SPEAKER_CHANNEL) {
		this.#channel = new BroadcastChannel(name);
		this.#channel.onmessage = (event: MessageEvent) => {
			const message = event.data as SpeakerMessage;
			if (message && typeof message === 'object') this.onmessage?.(message);
		};
	}

	/** Sends a message to every other window on the channel. */
	post(message: SpeakerMessage) {
		this.#channel.postMessage(message);
	}

	/** Closes the underlying channel. */
	close() {
		this.#channel.close();
	}
}
