import { describe, expect, it } from 'vitest';
import { buildFilterChain } from './chain.js';
import { VoiceoverRecorder } from './recorder.js';
import { DEFAULT_VOICEOVER_FILTERS } from './filters.js';

/*
 * The module graph reaches a package that extends AudioWorkletNode at import
 * time. That global does not exist here, so a plain import guards against the
 * whole editor route failing to server render.
 */
describe('voiceover module graph', () => {
	it('imports without a browser audio global', () => {
		expect(typeof buildFilterChain).toBe('function');
		expect(typeof VoiceoverRecorder).toBe('function');
		expect(globalThis.AudioWorkletNode).toBeUndefined();
	});

	it('only touches audio state when a chain is built', async () => {
		const context = undefined as unknown as AudioContext;
		await expect(buildFilterChain(context, DEFAULT_VOICEOVER_FILTERS)).rejects.toThrow();
	});

	it('constructs a recorder without starting the microphone', () => {
		const recorder = new VoiceoverRecorder();
		expect(recorder.state).toBe('idle');
		recorder.destroy();
	});
});
