import { describe, expect, it } from 'vitest';
import {
	livePeaks,
	loadPeaks,
	peaksOf,
	prunePeaks,
	seedPeaks,
	slicePeaks,
	waveformLine
} from './waveform.js';
import { expectedPeaks, parseMonoPcm, peaksFromChannel } from './waveform.js';
import type { VoiceoverClip } from '../voiceover/types.js';

function clip(id: string, duration = 1): VoiceoverClip {
	return {
		id,
		label: id,
		file: `${id}.wav`,
		start: 0,
		duration,
		trimStart: 0,
		sourceDuration: duration,
		mime: 'audio/wav'
	};
}

/** A WAV with a known set of samples, built the same way the recorder does. */
function wav(samples: readonly number[]): Blob {
	const buffer = new ArrayBuffer(44 + samples.length * 2);
	const view = new DataView(buffer);
	const tag = (offset: number, text: string) => {
		for (let index = 0; index < text.length; index++) {
			view.setUint8(offset + index, text.charCodeAt(index));
		}
	};
	tag(0, 'RIFF');
	tag(8, 'WAVE');
	tag(12, 'fmt ');
	tag(36, 'data');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint32(24, 48000, true);
	view.setUint16(22, 1, true);
	view.setUint16(34, 16, true);
	view.setUint32(40, samples.length * 2, true);
	samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample * 32767, true));
	return new Blob([buffer], { type: 'audio/wav' });
}

describe('parseMonoPcm', () => {
	it('reads the samples back out of a wav', async () => {
		const source = wav([0, 0.5, -0.5, 1]);
		const samples = parseMonoPcm(await source.arrayBuffer());
		expect(samples).toHaveLength(4);
		expect(samples[0]).toBeCloseTo(0, 4);
		expect(samples[1]).toBeCloseTo(0.5, 3);
		expect(samples[2]).toBeCloseTo(-0.5, 3);
	});

	it('returns nothing for a file that is not a wav', () => {
		expect(parseMonoPcm(new ArrayBuffer(8))).toHaveLength(0);
	});
});

describe('peaksFromChannel', () => {
	it('draws a flat line for silence', () => {
		const peaks = peaksFromChannel(new Float32Array(4800));
		expect(peaks.every((peak) => peak === 0)).toBe(true);
	});

	it('takes the loudest sample of each bar and scales it to full height', () => {
		const channel = new Float32Array(4800);
		for (let index = 0; index < channel.length; index++)
			channel[index] = Math.sin(index / 20) * 0.5;
		const peaks = peaksFromChannel(channel);
		expect(Math.max(...peaks)).toBeCloseTo(1, 2);
	});

	it('keeps a loud passage taller than a quiet one', () => {
		const channel = new Float32Array(9600);
		for (let index = 0; index < 4800; index++) channel[index] = Math.sin(index / 20) * 0.1;
		for (let index = 4800; index < 9600; index++) channel[index] = Math.sin(index / 20);
		const peaks = peaksFromChannel(channel);
		const quiet = Math.max(...peaks.slice(0, peaks.length / 2));
		const loud = Math.max(...peaks.slice(peaks.length / 2));
		expect(quiet).toBeLessThan(loud);
	});
});

describe('livePeaks', () => {
	it('draws a flat line before any audio arrives', () => {
		const peaks = livePeaks([]);
		expect(peaks.length).toBeGreaterThan(0);
		expect(peaks.every((peak) => peak === 0)).toBe(true);
	});

	it('draws a flat line when the channel is still empty', () => {
		const peaks = livePeaks([new Float32Array(0)]);
		expect(peaks.every((peak) => peak === 0)).toBe(true);
	});

	it('grows with the take as samples arrive', () => {
		// a very short take clamps to the minimum columns, a longer one passes it
		const short = new Float32Array(4800);
		const long = new Float32Array(96000);
		for (let index = 0; index < long.length; index++) long[index] = Math.sin(index / 20) * 0.5;
		short.set(long.subarray(0, 4800));

		const shortPeaks = livePeaks([short]);
		const longPeaks = livePeaks([long]);
		expect(shortPeaks.length).toBe(16);
		expect(longPeaks.length).toBeGreaterThan(shortPeaks.length);
	});

	it('shows the shape of the captured audio', () => {
		// half silent, half loud, so the columns must differ across the take
		const channel = new Float32Array(9600);
		for (let index = 4800; index < channel.length; index++) {
			channel[index] = Math.sin(index / 20) * 0.8;
		}
		const peaks = livePeaks([channel]);
		const quietHalf = peaks.slice(0, Math.floor(peaks.length / 2));
		const loudHalf = peaks.slice(Math.floor(peaks.length / 2));
		expect(Math.max(...quietHalf)).toBe(0);
		// the loud half is scaled to fill, so its columns reach full height
		expect(Math.max(...loudHalf)).toBeCloseTo(1, 2);
	});
});

describe('waveformLine', () => {
	it('draws nothing without peaks or room', () => {
		expect(waveformLine([], 100, 100)).toBe('');
		expect(waveformLine([1, 2], 0, 100)).toBe('');
		expect(waveformLine([1, 2], 100, 0)).toBe('');
	});

	it('mirrors each peak about the middle, so the line has a body', () => {
		const path = waveformLine([1], 10, 100);
		// a full peak reaches the top edge and the bottom edge
		expect(path).toContain('0.00 0.00');
		expect(path).toContain('0.00 100.00');
	});

	it('draws silence as a line through the middle', () => {
		const path = waveformLine([0, 0], 10, 100);
		expect(path).toContain('50.00');
		expect(path).not.toContain('0.00 0.00');
	});

	it('skips peaks when there are more than fit across the width', () => {
		const many = Array.from({ length: 400 }, () => 1);
		const path = waveformLine(many, 20, 100);
		// twenty pixels hold at most forty columns, far fewer than four hundred
		expect(path.split('L').length).toBeLessThanOrEqual(80);
		expect(path.split('L').length).toBeGreaterThan(20);
	});

	it('keeps every peak when the clip is wider than the data', () => {
		const path = waveformLine([0.5, 1], 500, 100);
		expect(path.split('L').length).toBe(4);
	});
});

describe('seedPeaks', () => {
	it('gives a saved clip its waveform without reading the file back', () => {
		const target = clip('seeded');
		expect(peaksOf(target)).toBeNull();
		seedPeaks(target.id, [0.5]);
		expect(peaksOf(target)).toEqual([0.5]);
	});

	it('survives pruning only while the clip exists', () => {
		const target = clip('seeded-then-gone');
		seedPeaks(target.id, [1]);
		prunePeaks([]);
		expect(peaksOf(target)).toBeNull();
	});
});

describe('slicePeaks', () => {
	const peaks = Array.from({ length: 100 }, (_, index) => index);

	it('keeps the whole set for an untrimmed clip', () => {
		expect(slicePeaks(peaks, clip('whole', 1))).toEqual(peaks);
	});

	it('draws only the trimmed window', () => {
		const trimmed = clip('trimmed', 0.5);
		trimmed.trimStart = 0.25;
		trimmed.sourceDuration = 1;
		const sliced = slicePeaks(peaks, trimmed);
		// a window from a quarter to three quarters keeps the middle half
		expect(sliced[0]).toBe(25);
		expect(sliced.at(-1)).toBe(74);
	});

	it('returns a single bar when the window is tiny', () => {
		const tiny = clip('tiny', 0.001);
		tiny.sourceDuration = 1;
		expect(slicePeaks(peaks, tiny)).toHaveLength(1);
	});

	it('leaves an empty set alone', () => {
		expect(slicePeaks([], clip('none', 1))).toEqual([]);
	});
});

describe('peak cache', () => {
	it('reads peaks once and remembers them', async () => {
		const target = clip('cached');
		expect(peaksOf(target)).toBeNull();
		const peaks = await loadPeaks(target, wav([0, 1, 0, 1]));
		expect(peaks.length).toBeGreaterThan(0);
		expect(peaksOf(target)).toBe(peaks);
	});

	it('drops peaks for clips that no longer exist', async () => {
		const target = clip('gone');
		await loadPeaks(target, wav([0, 1]));
		prunePeaks([]);
		expect(peaksOf(target)).toBeNull();
	});

	it('still draws when the audio cannot be read', async () => {
		const target = clip('broken');
		const peaks = await loadPeaks(target, new Blob([], { type: 'audio/wav' }));
		expect(peaks.length).toBe(expectedPeaks(target.duration));
	});
});
