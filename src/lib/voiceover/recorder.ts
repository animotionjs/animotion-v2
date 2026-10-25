import type { VoiceoverRecording } from './types.js';
import { VOICEOVER_CHANNELS, VOICEOVER_SAMPLE_RATE, encodeWav } from './pcm.js';
import { CaptureBuffer, createCaptureNode } from './worklet.js';
import { buildFilterChain, type FilterChain } from './chain.js';
import { DEFAULT_VOICEOVER_FILTERS, type VoiceoverFilterSettings } from './filters.js';

export type VoiceoverRecorderState = 'idle' | 'requesting' | 'recording' | 'stopping' | 'error';

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
	if (typeof AudioContext !== 'undefined') return AudioContext;
	const fallback = (
		globalThis as typeof globalThis & { webkitAudioContext?: AudioContextConstructor }
	).webkitAudioContext;
	return fallback ?? null;
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

/**
 * Captures the microphone through the input filter chain and writes a PCM master.
 *
 * The browser's own encoder is deliberately not used. It decides the codec,
 * the bitrate and the container, hides the sample rate, and often leaves the
 * duration out of the header, which forces a full decode just to learn how
 * long a take is. Capturing the samples directly gives the exact duration,
 * the loudness peaks for the timeline, and one format for every browser.
 */
export class VoiceoverRecorder {
	#state: VoiceoverRecorderState = 'idle';
	#stream: MediaStream | null = null;
	#context: AudioContext | null = null;
	#source: MediaStreamAudioSourceNode | null = null;
	#chain: FilterChain | null = null;
	#capture: AudioWorkletNode | null = null;
	#buffer = new CaptureBuffer();
	#destroyed = false;

	constructor() {}

	get state() {
		return this.#state;
	}

	/** The samples captured so far, used for the live waveform while recording. */
	get channels(): readonly Float32Array[] {
		return this.#buffer.channels;
	}

	async start(filters: VoiceoverFilterSettings = DEFAULT_VOICEOVER_FILTERS): Promise<void> {
		if (this.#destroyed) throw new Error('The recorder has been destroyed.');
		if (this.#state !== 'idle' && this.#state !== 'error') {
			throw new Error('A voiceover recording is already active.');
		}
		if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
			throw new Error('Microphone recording is not available in this browser.');
		}
		const Context = audioContextConstructor();
		if (Context === null) {
			throw new Error('Microphone recording is not available in this browser.');
		}

		this.#state = 'requesting';
		this.#buffer.clear();
		try {
			this.#stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					channelCount: VOICEOVER_CHANNELS,
					sampleRate: VOICEOVER_SAMPLE_RATE,
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: false
				}
			});
			if (this.#destroyed) {
				this.#releaseStream();
				return;
			}

			// a device only accepts its own rate, so the context follows the device
			this.#context = new Context({ sampleRate: VOICEOVER_SAMPLE_RATE });
			if (this.#context.state === 'suspended') await this.#context.resume();
			this.#chain = await buildFilterChain(this.#context, filters);
			this.#source = this.#context.createMediaStreamSource(this.#stream);
			this.#capture = createCaptureNode(this.#context);
			this.#capture.port.onmessage = (event: MessageEvent<Float32Array[]>) => {
				this.#buffer.append(event.data);
			};
			this.#source.connect(this.#chain.input);
			this.#chain.output.connect(this.#capture);
			/*
			 * The worklet is pulled only when it reaches the destination, so a
			 * silent gain node carries it there without making the mic audible.
			 */
			this.#capture.connect(this.#context.destination);
			this.#state = 'recording';
		} catch (error) {
			this.#teardown();
			this.#state = 'error';
			throw readableError(error);
		}
	}

	async stop(): Promise<VoiceoverRecording> {
		if (this.#state !== 'recording') {
			throw new Error('No voiceover recording is active.');
		}
		this.#state = 'stopping';

		const channels = this.#buffer.channels;
		const frames = this.#buffer.frames;
		const rate = this.#context?.sampleRate ?? VOICEOVER_SAMPLE_RATE;
		this.#teardown();
		this.#state = 'idle';

		if (frames === 0) throw new Error('The recording was empty.');
		const blob = encodeWav(channels, rate);
		return { blob, duration: frames / rate, mime: 'audio/wav' };
	}

	destroy(): void {
		this.#destroyed = true;
		this.cancel();
	}

	cancel(): void {
		this.#teardown();
		this.#state = 'idle';
	}

	#teardown(): void {
		if (this.#capture !== null) {
			this.#capture.port.onmessage = null;
			this.#capture.disconnect();
			this.#capture = null;
		}
		this.#chain?.dispose();
		this.#chain = null;
		this.#source?.disconnect();
		this.#source = null;
		this.#releaseStream();
		const context = this.#context;
		this.#context = null;
		if (context !== null && context.state !== 'closed') {
			void context.close().catch(() => {
				// the samples are already captured, closing is a courtesy
			});
		}
	}

	#releaseStream(): void {
		for (const track of this.#stream?.getTracks() ?? []) track.stop();
		this.#stream = null;
	}
}
