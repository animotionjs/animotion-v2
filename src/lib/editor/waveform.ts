import { SvelteMap } from 'svelte/reactivity';
import type { VoiceoverClip } from '../voiceover/types.js';

/** Peak height of each bar, from 0 to 1, ready to draw. */
export type WaveformPeaks = readonly number[];

/** How many bars one second of audio is drawn with. */
const PEAKS_PER_SECOND = 60;
const MAX_PEAKS = 4000;
const MIN_PEAKS = 16;

/*
 * Peaks are cached per clip, because reading and reducing a recording is far
 * too slow to repeat on every zoom or redraw.
 */
const cached = new SvelteMap<string, WaveformPeaks>();
const loading = new Map<string, Promise<WaveformPeaks>>();

function silent(size: number): WaveformPeaks {
	return Array.from({ length: Math.max(MIN_PEAKS, size) }, () => 0);
}

/**
 * Reduces one channel to a peak per bar, taking the loudest sample in each
 * slice so a quiet word still shows against a loud one.
 */
export function peaksFromChannel(channel: Float32Array): number[] {
	const bars = expectedPeaks(channel.length / 48000);
	const peaks: number[] = [];
	const samplesPerBar = Math.max(1, Math.floor(channel.length / bars));
	for (let bar = 0; bar < bars; bar++) {
		const start = bar * samplesPerBar;
		const end = bar === bars - 1 ? channel.length : start + samplesPerBar;
		let peak = 0;
		for (let index = start; index < end; index++) {
			const value = Math.abs(channel[index] ?? 0);
			if (value > peak) peak = value;
		}
		peaks.push(peak);
	}
	// a silent clip would otherwise draw as a flat line with no visible body
	const loudest = peaks.reduce((highest, value) => Math.max(highest, value), 0);
	if (loudest <= 0) return peaks;
	return peaks.map((peak) => Math.min(1, peak / loudest));
}

export function expectedPeaks(duration: number): number {
	return Math.max(MIN_PEAKS, Math.min(MAX_PEAKS, Math.round(duration * PEAKS_PER_SECOND)));
}

/**
 * A single polyline through the peaks, in a box `width` wide and `height`
 * tall.
 *
 * The line is stroked rather than filled, and it is mirrored about the middle
 * of the box. Joining the peaks instead of drawing each one as its own bar is
 * what makes the shape read as one continuous waveform, the way an audio
 * editor draws it.
 *
 * Peaks are skipped when the clip is wider than the data, so a long take does
 * not draw more columns than it has room for.
 */
export function waveformLine(peaks: WaveformPeaks, width: number, height: number): string {
	if (peaks.length === 0 || width <= 0 || height <= 0) return '';
	/*
	 * A mirrored outline needs two points per column, one above the middle and
	 * one below, so the columns are counted against twice the width. Without
	 * that the columns crowd into a comb of vertical teeth instead of a shape.
	 */
	const step = Math.max(1, Math.ceil(peaks.length / Math.max(1, width * 2)));
	const middle = height / 2;
	const scale = height / 2;
	const points: string[] = [];
	for (let index = 0; index < peaks.length; index += step) {
		const x = ((index / Math.max(1, peaks.length - 1)) * width).toFixed(2);
		const amplitude = Math.min(1, peaks[index] ?? 0) * scale;
		// mirrored about the middle, so the line has a body above and below it
		points.push(`${x} ${(middle - amplitude).toFixed(2)}`);
		points.push(`${x} ${(middle + amplitude).toFixed(2)}`);
	}
	if (points.length < 2) return '';
	return `M${points.join('L')}`;
}

/**
 * Peaks for a take still being captured. The recorder holds raw channels that
 * arrive block by block, so a take is reduced the same way a saved one is,
 * from whatever samples exist at the moment it is read.
 *
 * Nothing is cached here. A live take changes on every read, and the caller
 * only asks for it on its own timer.
 */
export function livePeaks(channels: readonly Float32Array[]): WaveformPeaks {
	const samples = channels[0];
	if (samples === undefined || samples.length === 0) {
		return silent(MIN_PEAKS);
	}
	return peaksFromChannel(samples);
}

/** Cached peaks for a clip, or null while its audio is still being read. */
export function peaksOf(clip: VoiceoverClip): WaveformPeaks | null {
	return cached.get(clip.id) ?? null;
}

/**
 * The peaks of the whole recording, cut down to the part a clip plays. The
 * cache holds every sample of the take, so a trimmed clip draws only its
 * window and stays correct as the window moves.
 */
export function slicePeaks(peaks: WaveformPeaks, clip: VoiceoverClip): WaveformPeaks {
	if (peaks.length === 0) return peaks;
	const source = clip.sourceDuration > 0 ? clip.sourceDuration : clip.trimStart + clip.duration;
	const start = Math.floor((clip.trimStart / source) * peaks.length);
	const end = Math.ceil(((clip.trimStart + clip.duration) / source) * peaks.length);
	const first = Math.max(0, Math.min(start, peaks.length - 1));
	const last = Math.max(first + 1, Math.min(end, peaks.length));
	return peaks.slice(first, last);
}

/**
 * Stores peaks already in hand, for a take that was just captured. Its samples
 * were live a moment ago, so reading the saved file back would only make the
 * waveform blank and reappear.
 */
export function seedPeaks(id: string, peaks: WaveformPeaks): void {
	cached.set(id, peaks);
}

/**
 * Reads a clip's PCM into peaks once and keeps them for the session.
 *
 * The master is uncompressed, so the samples are read directly instead of
 * being decoded, which is why there is no audio context here.
 */
export async function loadPeaks(clip: VoiceoverClip, source: Blob): Promise<WaveformPeaks> {
	const ready = cached.get(clip.id);
	if (ready) return ready;
	const pending = loading.get(clip.id);
	if (pending) return pending;

	const work = read(source)
		.catch(() => silent(expectedPeaks(clip.sourceDuration)))
		.then((peaks) => {
			cached.set(clip.id, peaks);
			loading.delete(clip.id);
			return peaks;
		});
	loading.set(clip.id, work);
	return work;
}

async function read(source: Blob): Promise<WaveformPeaks> {
	const channel = parseMonoPcm(await source.arrayBuffer());
	if (channel.length === 0) throw new Error('The recording had no samples');
	return peaksFromChannel(channel);
}

/**
 * Reads the samples out of a WAV, ignoring the header. The masters are written
 * by this project, so the layout is known and a full parser would be unused.
 */
export function parseMonoPcm(buffer: ArrayBuffer): Float32Array {
	const view = new DataView(buffer);
	if (view.byteLength < 44) return new Float32Array(0);
	let offset = 12;
	while (offset + 8 <= view.byteLength) {
		const id = String.fromCharCode(
			view.getUint8(offset),
			view.getUint8(offset + 1),
			view.getUint8(offset + 2),
			view.getUint8(offset + 3)
		);
		const size = view.getUint32(offset + 4, true);
		if (id === 'data')
			return readSamples(view, offset + 8, Math.min(size, view.byteLength - offset - 8));
		offset += 8 + size + (size % 2);
	}
	return new Float32Array(0);
}

function readSamples(view: DataView, start: number, bytes: number): Float32Array {
	const count = Math.floor(bytes / 2);
	const samples = new Float32Array(count);
	for (let index = 0; index < count; index++) {
		samples[index] = view.getInt16(start + index * 2, true) / 32768;
	}
	return samples;
}

/** Drops cached peaks for clips that no longer exist. */
export function prunePeaks(clips: readonly VoiceoverClip[]): void {
	const alive = new Set(clips.map((clip) => clip.id));
	for (const id of [...cached.keys()]) {
		if (!alive.has(id)) cached.delete(id);
	}
}
