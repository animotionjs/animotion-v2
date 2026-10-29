/** One scene in the speaker outline. */
export interface SpeakerScene {
	id: string;
}

/**
 * Snapshot of the presentation broadcast to the speaker view. Sent whenever
 * the active scene or step changes, and on request.
 */
export interface SpeakerState {
	/** Active scene id. */
	sceneId: string;
	/** Index of the active scene in the sequence. */
	sceneIndex: number;
	/** Total number of scenes. */
	totalScenes: number;
	/** Current step. */
	step: number;
	/** Last step in the active scene. */
	max: number;
	/** Every scene, for the outline. */
	scenes: SpeakerScene[];
	/** Slide aspect ratio, for scaling the preview. */
	aspectRatio: { width: number; height: number };
	/** Current scene's notes markup, from its hidden `[data-notes]` box. */
	notes?: string;
}

/** A command sent from the speaker view to the presentation. */
export type SpeakerCommand =
	| { type: 'next' }
	| { type: 'prev' }
	| { type: 'goto'; id: string }
	/** Requests a fresh state broadcast. */
	| { type: 'hello' };

/** Message exchanged between the presentation and the speaker view. */
export type SpeakerMessage = { type: 'state'; state: SpeakerState } | SpeakerCommand;

/** Broadcast channel name for one presentation. */
export function speakerChannelName(slug: string): string {
	return `animotion-speaker:${slug}`;
}

/**
 * Wraps the BroadcastChannel shared between the presentation window and the
 * speaker view of one presentation.
 */
export class SpeakerSession {
	#channel: BroadcastChannel;
	/** Invoked with each message received from the other window. */
	onmessage: ((message: SpeakerMessage) => void) | null = null;

	constructor(name: string) {
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
