/*
 * Voiceover masters are stored as PCM, so nothing is lost before the export
 * encodes them and before audio effects are applied. YouTube asks for 48 kHz
 * and re-encodes every upload, so a second lossy pass is worth avoiding.
 */
export const VOICEOVER_SAMPLE_RATE = 48000;
export const VOICEOVER_CHANNELS = 1;
export const VOICEOVER_BITS = 16;

const WAV_HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = VOICEOVER_BITS / 8;
const INT16_MAX = 32767;
const INT16_MIN = -32768;

/**
 * Mixes the captured channels down to one and writes a 16 bit WAV. The
 * browser captures a stream, which may be stereo even for a mono microphone,
 * and narration is mono, so the channels are averaged rather than dropped.
 */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number): Blob {
	const frames = channels.reduce((longest, channel) => Math.max(longest, channel.length), 0);
	const bytes = WAV_HEADER_BYTES + frames * VOICEOVER_CHANNELS * BYTES_PER_SAMPLE;
	const buffer = new ArrayBuffer(bytes);
	const view = new DataView(buffer);

	writeHeader(view, frames, sampleRate);

	const channelCount = channels.length;
	let offset = WAV_HEADER_BYTES;
	for (let frame = 0; frame < frames; frame++) {
		let sum = 0;
		for (let channel = 0; channel < channelCount; channel++) {
			sum += channels[channel][frame] ?? 0;
		}
		view.setInt16(offset, toInt16(channelCount === 0 ? 0 : sum / channelCount), true);
		offset += BYTES_PER_SAMPLE;
	}

	return new Blob([buffer], { type: 'audio/wav' });
}

function writeHeader(view: DataView, frames: number, sampleRate: number): void {
	const blockAlign = VOICEOVER_CHANNELS * BYTES_PER_SAMPLE;
	const dataBytes = frames * blockAlign;

	writeAscii(view, 0, 'RIFF');
	view.setUint32(4, 36 + dataBytes, true);
	writeAscii(view, 8, 'WAVE');
	writeAscii(view, 12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, VOICEOVER_CHANNELS, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, VOICEOVER_BITS, true);
	writeAscii(view, 36, 'data');
	view.setUint32(40, dataBytes, true);
}

function writeAscii(view: DataView, offset: number, text: string): void {
	for (let index = 0; index < text.length; index++) {
		view.setUint8(offset + index, text.charCodeAt(index));
	}
}

/** Clamps rather than wraps, so a loud take distorts instead of clicking. */
function toInt16(sample: number): number {
	const scaled = sample * INT16_MAX;
	if (scaled >= INT16_MAX) return INT16_MAX;
	if (scaled <= INT16_MIN) return INT16_MIN;
	return Math.round(scaled);
}
