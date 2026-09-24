import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioController } from './controller.js';
import { createSoundCue, SOUND_SAMPLE_RATE } from './sound.js';
import type { SoundCue } from './sound.js';

class MockAudioBuffer {
	readonly numberOfChannels: number;
	readonly length: number;
	readonly sampleRate: number;
	readonly #channels: Float32Array[];

	constructor(numberOfChannels: number, length: number, sampleRate: number) {
		this.numberOfChannels = numberOfChannels;
		this.length = length;
		this.sampleRate = sampleRate;
		this.#channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
	}

	get duration(): number {
		return this.length / this.sampleRate;
	}

	getChannelData(channel: number): Float32Array {
		const samples = this.#channels[channel];
		if (samples === undefined) {
			throw new RangeError('Unknown channel');
		}

		return samples;
	}

	copyToChannel(source: Float32Array, channelNumber: number, bufferOffset = 0): void {
		this.getChannelData(channelNumber).set(source, bufferOffset);
	}
}

class MockAudioBufferSource {
	buffer: MockAudioBuffer | null = null;
	onended: (() => void) | null = null;
	startedAt: number | null = null;
	offset = 0;
	stopped = false;
	readonly playbackRate = { value: 1 };
	readonly connections: unknown[] = [];

	connect(destination: unknown): unknown {
		this.connections.push(destination);
		return destination;
	}

	start(when = 0, offset = 0): void {
		this.startedAt = when;
		this.offset = offset;
	}

	stop(): void {
		this.stopped = true;
	}

	emitEnded(): void {
		this.onended?.();
	}
}

class MockAudioContext {
	state: AudioContextState;
	currentTime = 0;
	readonly sampleRate = 44100;
	readonly destination = {};
	readonly buffers: MockAudioBuffer[] = [];
	readonly sources: MockAudioBufferSource[] = [];
	readonly createBuffer = vi.fn(
		(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer => {
			const buffer = new MockAudioBuffer(numberOfChannels, length, sampleRate);
			this.buffers.push(buffer);
			return buffer as unknown as AudioBuffer;
		}
	);
	readonly createBufferSource = vi.fn((): AudioBufferSourceNode => {
		const source = new MockAudioBufferSource();
		this.sources.push(source);
		return source as unknown as AudioBufferSourceNode;
	});
	readonly resume = vi.fn(async (): Promise<void> => {
		this.state = 'running';
	});
	readonly close = vi.fn(async (): Promise<void> => {
		this.state = 'closed';
	});

	constructor(state: AudioContextState = 'suspended') {
		this.state = state;
	}
}

function installAudioContext(state: AudioContextState = 'suspended') {
	const context = new MockAudioContext(state);
	const constructor = vi.fn(function () {
		return context;
	});
	vi.stubGlobal('AudioContext', constructor);
	return { context, constructor };
}

function createCue(duration: number): SoundCue {
	return createSoundCue('click', { duration, fadeIn: 0, fadeOut: 0 });
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('AudioController', () => {
	it('is safe when the Web Audio API is unavailable', async () => {
		vi.stubGlobal('AudioContext', undefined);
		const controller = new AudioController();
		controller.load([], 2);

		controller.sync(0.5, true);
		expect(controller.currentTime).toBe(0.5);
		expect(controller.playing).toBe(false);

		await controller.play(1);
		expect(await controller.unlock()).toBe(false);
		expect(controller.currentTime).toBe(1);
		expect(controller.playing).toBe(false);

		controller.pause();
		controller.seek(4);
		controller.stop();
		expect(controller.currentTime).toBe(0);
	});

	it('creates and resumes a context only when unlocking', async () => {
		const controller = new AudioController();
		const { context, constructor } = installAudioContext();

		expect(await controller.unlock()).toBe(true);
		expect(constructor).toHaveBeenCalledOnce();
		expect(context.resume).toHaveBeenCalledOnce();
		expect(await controller.unlock()).toBe(true);
		expect(constructor).toHaveBeenCalledOnce();
		expect(context.resume).toHaveBeenCalledOnce();
	});

	it('reports a blocked resume without starting audio', async () => {
		const controller = new AudioController();
		const { context } = installAudioContext();
		context.resume.mockRejectedValue(new Error('Autoplay is blocked'));
		controller.load([createCue(0.02)], 0.02);

		await controller.play(0.01);

		expect(await controller.unlock()).toBe(false);
		expect(controller.currentTime).toBe(0.01);
		expect(controller.playing).toBe(false);
		expect(context.sources).toHaveLength(0);
	});

	it('mixes a mono buffer at the sound sample rate and starts a source', async () => {
		const controller = new AudioController();
		const { context } = installAudioContext();
		controller.load([createCue(0.02)], 0.02);

		await controller.play(0.005);

		expect(context.createBuffer).toHaveBeenCalledWith(
			1,
			SOUND_SAMPLE_RATE * 0.02,
			SOUND_SAMPLE_RATE
		);
		expect(context.buffers[0]?.numberOfChannels).toBe(1);
		expect(context.buffers[0]?.getChannelData(0)).toHaveLength(SOUND_SAMPLE_RATE * 0.02);
		expect(context.sources).toHaveLength(1);

		const source = context.sources[0];
		expect(source?.buffer).toBe(context.buffers[0]);
		expect(source?.connections).toEqual([context.destination]);
		expect(source?.startedAt).toBe(0);
		expect(source?.offset).toBe(0.005);
		expect(controller.currentTime).toBe(0.005);
		expect(controller.playing).toBe(true);
	});

	it('keeps a running source through small drift and restarts it for meaningful seeks', async () => {
		const controller = new AudioController();
		const { context } = installAudioContext();
		controller.load([createCue(2)], 2);
		await controller.play(0.2);
		const firstSource = context.sources[0];

		controller.sync(0.21, true);
		expect(context.sources).toHaveLength(1);

		context.currentTime = 0.1;
		controller.sync(0.31, true);
		expect(context.sources).toHaveLength(1);

		controller.sync(0.6, true);
		expect(context.sources).toHaveLength(2);
		expect(firstSource?.stopped).toBe(true);
		expect(context.sources[1]?.offset).toBe(0.6);

		controller.sync(0.62, false);
		expect(context.sources[1]?.stopped).toBe(true);
		expect(controller.currentTime).toBe(0.62);
		expect(controller.playing).toBe(false);
	});

	it('starts a deferred sync after autoplay is unlocked', async () => {
		const controller = new AudioController();
		const { context } = installAudioContext();
		controller.load([createCue(1)], 1);

		controller.sync(0.2, true);
		expect(context.sources).toHaveLength(0);
		await controller.unlock();

		expect(context.sources).toHaveLength(1);
		expect(context.sources[0]?.offset).toBe(0.2);
	});

	it('applies timeline playback speed to the running source', async () => {
		const controller = new AudioController();
		const { context } = installAudioContext();
		controller.load([createCue(2)], 2);
		await controller.play(0.2);

		context.currentTime = 0.5;
		controller.sync(0.7, true, 2);

		expect(context.sources[0]?.playbackRate.value).toBe(2);
		expect(controller.currentTime).toBeCloseTo(0.7, 5);
	});

	it('pauses at the source position and clamps playback and seeks', async () => {
		const controller = new AudioController();
		const { context } = installAudioContext();
		controller.load([createCue(2)], 2);

		await controller.play(-1);
		context.currentTime = 0.25;
		controller.pause();
		expect(controller.currentTime).toBe(0.25);

		await controller.play();
		context.currentTime = 0.75;
		controller.seek(1.5);
		expect(context.sources[2]?.offset).toBe(1.5);
		expect(controller.currentTime).toBe(1.5);

		context.currentTime = 1.25;
		controller.pause();
		expect(controller.currentTime).toBe(2);
		controller.seek(Number.NaN);
		expect(controller.currentTime).toBe(2);
		controller.seek(Number.POSITIVE_INFINITY);
		expect(controller.currentTime).toBe(2);
	});

	it('ignores stale ended events and finishes at the scene duration', async () => {
		const controller = new AudioController();
		const { context } = installAudioContext();
		controller.load([createCue(2)], 2);
		await controller.play(0.25);
		const staleEnded = context.sources[0]?.onended;

		controller.seek(0.75);
		context.currentTime = 0.1;
		staleEnded?.();
		expect(controller.playing).toBe(true);
		expect(controller.currentTime).toBe(0.85);

		context.sources[1]?.emitEnded();
		expect(controller.currentTime).toBe(2);
		expect(controller.playing).toBe(false);
	});

	it('resets safely when loading an invalid duration', async () => {
		const controller = new AudioController();
		const { context } = installAudioContext('running');
		controller.load([createCue(1)], 1);
		await controller.play();

		controller.load([], -1);

		expect(controller.duration).toBe(0);
		expect(controller.currentTime).toBe(0);
		expect(controller.playing).toBe(false);
		expect(context.sources[0]?.stopped).toBe(true);

		await controller.play(1);
		controller.sync(Number.POSITIVE_INFINITY, true);
		expect(context.sources).toHaveLength(1);
		expect(controller.duration).toBe(0);
		expect(controller.currentTime).toBe(0);
	});

	it('stops and closes its context on destroy', async () => {
		const controller = new AudioController();
		const { context, constructor } = installAudioContext();
		controller.load([createCue(1)], 1);
		await controller.play();

		controller.destroy();

		expect(context.sources[0]?.stopped).toBe(true);
		expect(context.close).toHaveBeenCalledOnce();
		expect(controller.currentTime).toBe(0);
		expect(controller.playing).toBe(false);
		expect(await controller.unlock()).toBe(false);

		await controller.play();
		expect(constructor).toHaveBeenCalledOnce();
		expect(context.sources).toHaveLength(1);
	});
});
