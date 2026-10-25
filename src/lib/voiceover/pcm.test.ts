import { describe, expect, it } from 'vitest';
import { VOICEOVER_SAMPLE_RATE, encodeWav } from './pcm.js';

function tone(frames: number, amplitude = 0.5, rate = 1): Float32Array {
	const samples = new Float32Array(frames);
	for (let index = 0; index < frames; index++) samples[index] = Math.sin(index / rate) * amplitude;
	return samples;
}

async function samplesOf(blob: Blob): Promise<Float32Array> {
	const view = new DataView(await blob.arrayBuffer());
	const start = 44;
	const count = (view.byteLength - start) / 2;
	const samples = new Float32Array(count);
	for (let index = 0; index < count; index++) {
		samples[index] = view.getInt16(start + index * 2, true) / 32768;
	}
	return samples;
}

describe('encodeWav', () => {
	it('writes a mono 16 bit header at the requested rate', async () => {
		const blob = encodeWav([tone(480)], VOICEOVER_SAMPLE_RATE);
		const view = new DataView(await blob.arrayBuffer());

		expect(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer(), 0, 4))).toBe('RIFF');
		expect(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer(), 8, 4))).toBe('WAVE');
		expect(view.getUint16(20, true)).toBe(1);
		expect(view.getUint16(22, true)).toBe(1);
		expect(view.getUint32(24, true)).toBe(VOICEOVER_SAMPLE_RATE);
		expect(view.getUint16(34, true)).toBe(16);
		expect(view.getUint32(40, true)).toBe(480 * 2);
		expect(blob.type).toBe('audio/wav');
	});

	it('round trips the samples it was given', async () => {
		const source = tone(1000, 0.25);
		const written = await samplesOf(encodeWav([source], VOICEOVER_SAMPLE_RATE));
		expect(written).toHaveLength(source.length);
		for (let index = 0; index < source.length; index++) {
			expect(written[index]).toBeCloseTo(source[index], 4);
		}
	});

	it('averages several channels down to mono', async () => {
		const left = new Float32Array([1, 1, 1, 1]);
		const right = new Float32Array([-1, -1, -1, -1]);
		const written = await samplesOf(encodeWav([left, right], VOICEOVER_SAMPLE_RATE));
		for (const sample of written) expect(sample).toBe(0);
	});

	it('clamps a loud take instead of wrapping it', async () => {
		const written = await samplesOf(encodeWav([new Float32Array([4, -4])], VOICEOVER_SAMPLE_RATE));
		expect(written[0]).toBeCloseTo(1, 4);
		expect(written[1]).toBeCloseTo(-1, 4);
	});

	it('writes an empty but valid file for no samples', async () => {
		const blob = encodeWav([new Float32Array(0)], VOICEOVER_SAMPLE_RATE);
		expect(blob.size).toBe(44);
	});
});
