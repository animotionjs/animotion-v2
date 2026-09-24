import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceoverAudioController } from './controller.js';
import type { VoiceoverClip } from './types.js';

class FakeAudio {
	static instances: FakeAudio[] = [];
	#listeners = new Map<string, Set<() => void>>();
	currentTime = 0;
	playbackRate = 1;
	paused = true;
	src = '';
	preload = '';

	constructor() {
		FakeAudio.instances.push(this);
	}

	addEventListener(type: string, listener: () => void) {
		const listeners = this.#listeners.get(type) ?? new Set<() => void>();
		listeners.add(listener);
		this.#listeners.set(type, listeners);
	}

	removeAttribute(name: string) {
		if (name === 'src') this.src = '';
	}

	load() {
		queueMicrotask(() => {
			for (const listener of this.#listeners.get('loadedmetadata') ?? []) listener();
		});
	}

	pause() {
		this.paused = true;
	}

	play() {
		this.paused = false;
		return Promise.resolve();
	}
}

const clip: VoiceoverClip = {
	id: 'recording',
	sceneId: 'intro',
	label: 'Recording 1',
	file: 'recording.webm',
	start: 0,
	duration: 5,
	mime: 'audio/webm'
};

describe('VoiceoverAudioController', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		FakeAudio.instances = [];
	});

	it('keeps the latest playhead position while a source is loading', async () => {
		vi.stubGlobal('Audio', FakeAudio);
		vi.stubGlobal('URL', {
			createObjectURL: vi.fn(() => 'blob:recording'),
			revokeObjectURL: vi.fn()
		});
		let resolveSource: ((url: string) => void) | undefined;
		const source = new Promise<string>((resolve) => {
			resolveSource = resolve;
		});
		const controller = new VoiceoverAudioController();
		controller.load([clip], 10, () => source);

		controller.sync(0, true);
		controller.sync(2, true);
		resolveSource?.('blob:recording');
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(FakeAudio.instances[0]?.currentTime).toBe(2);
		controller.destroy();
	});
});
