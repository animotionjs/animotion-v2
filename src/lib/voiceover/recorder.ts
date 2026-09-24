import type { VoiceoverRecording } from './types.js';

export type VoiceoverRecorderState = 'idle' | 'requesting' | 'recording' | 'stopping' | 'error';
type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
	if (typeof AudioContext !== 'undefined') return AudioContext;
	const fallback = (
		globalThis as typeof globalThis & { webkitAudioContext?: AudioContextConstructor }
	).webkitAudioContext;
	return fallback ?? null;
}

function preferredMimeType(): string {
	if (typeof MediaRecorder === 'undefined') return '';
	const types = ['audio/webm', 'audio/ogg', 'audio/mp4'];
	if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
	return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

async function decodedDuration(blob: Blob): Promise<number | null> {
	const Context = audioContextConstructor();
	if (Context === null) return null;

	let context: AudioContext | null = null;
	try {
		context = new Context();
		const buffer = await context.decodeAudioData(await blob.arrayBuffer());
		return buffer.duration;
	} catch {
		return null;
	} finally {
		if (context !== null && context.state !== 'closed') {
			try {
				await context.close();
			} catch {
				// the duration fallback remains available when the context cannot close
			}
		}
	}
}

function readableError(error: unknown): Error {
	if (error instanceof DOMException && error.name === 'NotAllowedError') {
		return new Error('Microphone permission was denied.');
	}
	if (error instanceof DOMException && error.name === 'NotFoundError') {
		return new Error('No microphone was found.');
	}
	if (error instanceof Error) return error;
	return new Error('The microphone could not be started.');
}

export class VoiceoverRecorder {
	#state: VoiceoverRecorderState = 'idle';
	#stream: MediaStream | null = null;
	#recorder: MediaRecorder | null = null;
	#chunks: Blob[] = [];
	#startedAt = 0;
	#mime = '';
	#destroyed = false;
	#onError: (error: Error) => void;

	constructor(onError: (error: Error) => void = () => {}) {
		this.#onError = onError;
	}

	get state() {
		return this.#state;
	}

	async start(): Promise<void> {
		if (this.#destroyed) throw new Error('The recorder has been destroyed.');
		if (this.#state !== 'idle' && this.#state !== 'error') {
			throw new Error('A voiceover recording is already active.');
		}
		if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
			throw new Error('Microphone recording is not available in this browser.');
		}
		if (typeof MediaRecorder === 'undefined') {
			throw new Error('Microphone recording is not available in this browser.');
		}

		this.#state = 'requesting';
		this.#chunks = [];
		try {
			this.#stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			if (this.#destroyed) {
				this.#releaseStream();
				return;
			}
			this.#mime = preferredMimeType();
			const options = this.#mime ? { mimeType: this.#mime } : undefined;
			this.#recorder = new MediaRecorder(this.#stream, options);
			this.#recorder.addEventListener('dataavailable', (event) => {
				if (event.data.size > 0) this.#chunks.push(event.data);
			});
			const recorder = this.#recorder;
			recorder.addEventListener('error', () => {
				if (this.#recorder !== recorder) return;
				const error = new Error('The recording failed.');
				this.#state = 'error';
				this.#releaseStream();
				this.#recorder = null;
				this.#onError(error);
			});
			this.#recorder.start(100);
			this.#startedAt = performance.now();
			this.#state = 'recording';
		} catch (error) {
			this.#releaseStream();
			this.#state = 'error';
			throw readableError(error);
		}
	}

	async stop(): Promise<VoiceoverRecording> {
		if (this.#state !== 'recording' || this.#recorder === null) {
			throw new Error('No voiceover recording is active.');
		}

		this.#state = 'stopping';
		const recorder = this.#recorder;
		const startedAt = this.#startedAt;
		const result = await new Promise<{ blob: Blob; duration: number }>((resolve, reject) => {
			recorder.addEventListener(
				'stop',
				() => {
					resolve({
						blob: new Blob(this.#chunks, { type: this.#mime || 'audio/webm' }),
						duration: Math.max(0, (performance.now() - startedAt) / 1000)
					});
				},
				{ once: true }
			);
			recorder.addEventListener('error', () => reject(new Error('The recording failed.')), {
				once: true
			});
			try {
				recorder.stop();
			} catch (error) {
				reject(readableError(error));
			}
		}).finally(() => {
			this.#releaseStream();
			this.#recorder = null;
			this.#state = 'idle';
		});

		const duration = (await decodedDuration(result.blob)) ?? result.duration;
		const mime = (result.blob.type || this.#mime || 'audio/webm').split(';')[0];
		return { blob: result.blob, duration, mime };
	}

	destroy(): void {
		this.#destroyed = true;
		this.cancel();
	}

	cancel(): void {
		if (this.#recorder !== null && this.#state === 'recording') {
			try {
				this.#recorder.stop();
			} catch {
				this.#releaseStream();
			}
		}
		this.#releaseStream();
		this.#recorder = null;
		this.#state = 'idle';
	}

	#releaseStream() {
		for (const track of this.#stream?.getTracks() ?? []) track.stop();
		this.#stream = null;
	}
}
