import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioController } from './controller.js';
import { createAudioTrack } from './tracks.js';

class MockGainNode {
	static instances: MockGainNode[] = [];
	targets: number[] = [];
	value = 1;
	gain: MockGainNode;
	constructor() {
		// mirrors the gain audio param automation target
		this.gain = this;
		MockGainNode.instances.push(this);
	}
	setTargetAtTime(target: number) {
		this.targets.push(target);
	}
	connect() {}
	disconnect() {}
}

class MockSourceNode {
	connect() {
		return { connect() {} };
	}
	disconnect() {}
}

class MockAudioContext {
	static instances: MockAudioContext[] = [];
	state: AudioContextState = 'suspended';
	currentTime = 100;
	destination = {};
	resumes = 0;
	closes = 0;
	constructor() {
		MockAudioContext.instances.push(this);
	}
	createMediaElementSource() {
		return new MockSourceNode();
	}
	createGain() {
		return new MockGainNode();
	}
	async resume() {
		this.resumes++;
		this.state = 'running';
	}
	async close() {
		this.closes++;
		this.state = 'closed';
	}
}

class MockAudioElement {
	static instances: MockAudioElement[] = [];
	volume = 1;
	playbackRate = 1;
	preservesPitch: boolean | undefined;
	loop = false;
	preload = '';
	currentTime = 0;
	duration = 4;
	paused = true;
	src: string;
	constructor(src: string) {
		this.src = src;
		MockAudioElement.instances.push(this);
	}
	load() {}
	removeAttribute() {}
	pause() {
		this.paused = true;
	}
	async play() {
		this.paused = false;
	}
}

afterEach(() => {
	vi.unstubAllGlobals();
	MockGainNode.instances.length = 0;
	MockAudioContext.instances.length = 0;
	MockAudioElement.instances.length = 0;
});

function withBrowserAudio() {
	vi.stubGlobal('Audio', MockAudioElement);
	vi.stubGlobal('AudioContext', MockAudioContext);
}

describe('AudioController', () => {
	it('automates fades on the gain node and keeps element volume static', () => {
		withBrowserAudio();
		const controller = new AudioController();
		controller.load([createAudioTrack('x.mp3', { duration: 2, fadeIn: 0.5, fadeOut: 0.5 })], 4);

		controller.sync(0.25, true);
		expect(MockAudioElement.instances[0]!.volume).toBe(1);
		expect(MockGainNode.instances[0]!.targets.at(-1)!).toBeCloseTo(0.5);

		controller.sync(1.7, true);
		expect(MockGainNode.instances[0]!.targets.at(-1)!).toBeCloseTo(0.4);

		controller.sync(1.9, true);
		expect(MockGainNode.instances[0]!.targets.at(-1)!).toBe(0);

		controller.destroy();
	});

	it('resumes a suspended context on unlock', async () => {
		withBrowserAudio();
		const controller = new AudioController();
		controller.load([createAudioTrack('x.mp3')], 4);

		await controller.unlock();
		expect(MockAudioContext.instances[0]!.resumes).toBe(1);

		controller.destroy();
	});

	it('ends a cue with its file instead of retriggering the tail', () => {
		withBrowserAudio();
		const controller = new AudioController();
		controller.load([createAudioTrack('x.mp3', { duration: 30 })], 40);

		controller.sync(1, true);
		expect(MockAudioElement.instances[0]!.paused).toBe(false);

		controller.sync(5, true);
		expect(MockAudioElement.instances[0]!.paused).toBe(true);

		controller.destroy();
	});

	it('closes the context on destroy', () => {
		withBrowserAudio();
		const controller = new AudioController();
		controller.load([createAudioTrack('x.mp3')], 4);

		controller.destroy();
		expect(MockAudioContext.instances[0]!.closes).toBe(1);
	});

	it('falls back to element volume without AudioContext', () => {
		vi.stubGlobal('Audio', MockAudioElement);
		const controller = new AudioController();
		controller.load([createAudioTrack('x.mp3', { duration: 2, fadeIn: 0.5 })], 4);

		controller.sync(0.25, true);
		expect(MockAudioElement.instances[0]!.volume).toBeCloseTo(0.5);
		expect(MockGainNode.instances).toHaveLength(0);

		controller.destroy();
	});

	it('turns off pitch preservation so speed matches the render', () => {
		withBrowserAudio();
		const controller = new AudioController();
		controller.load([createAudioTrack('x.mp3', { rate: 2 })], 4);

		expect(MockAudioElement.instances[0]!.preservesPitch).toBe(false);

		controller.destroy();
	});

	it('uses the prefixed context when AudioContext is missing', () => {
		vi.stubGlobal('Audio', MockAudioElement);
		vi.stubGlobal('webkitAudioContext', MockAudioContext);
		const controller = new AudioController();
		controller.load([createAudioTrack('x.mp3', { duration: 2, fadeIn: 0.5 })], 4);

		controller.sync(0.25, true);
		expect(MockAudioElement.instances[0]!.volume).toBe(1);
		expect(MockGainNode.instances[0]!.targets.at(-1)!).toBeCloseTo(0.5);

		controller.destroy();
	});
});
