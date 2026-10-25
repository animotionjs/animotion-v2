/*
 * The voiceover worklets run on the audio thread. Capture hands every
 * rendered block back to the main thread. The equalizer, expander and
 * dynamics shape the mic before capture. They are ports of the OBS filters
 * of the same name, so a take sounds like the OBS chain it copies. All of
 * them are written as one string and loaded from a blob, so the recorder
 * stays one file with no separate asset to ship.
 */
const WORKLET_SOURCE = `
function voiceoverDbToMul(db) {
	return Math.pow(10, db / 20);
}

function voiceoverMulToDb(mul) {
	return 20 * Math.log10(mul);
}

function voiceoverGainCoefficient(seconds) {
	return Math.exp(-1 / (sampleRate * seconds));
}

/* Floors a level before the log so a silent block cannot make a NaN gain */
function voiceoverEnvDb(level) {
	return level > 1e-9 ? voiceoverMulToDb(level) : -180;
}

class VoiceoverCapture extends AudioWorkletProcessor {
	process(inputs) {
		const input = inputs[0];
		if (input && input.length > 0) {
			/*
			 * The block is copied before it is posted, because the buffer is
			 * reused by the audio thread on the next render.
			 */
			this.port.postMessage(input.map((channel) => channel.slice()));
		}
		return true;
	}
}
registerProcessor('voiceover-capture', VoiceoverCapture);

/*
 * OBS 3-Band Equalizer. A four pole lowpass at 800 Hz and a four pole
 * highpass at 5000 Hz split the signal, the middle is what is left, and
 * each band is scaled by its gain before the three are summed.
 */
class VoiceoverEq extends AudioWorkletProcessor {
	constructor(options) {
		super();
		const settings = (options && options.processorOptions) || {};
		this.low = voiceoverDbToMul(settings.low || 0);
		this.mid = voiceoverDbToMul(settings.mid || 0);
		this.high = voiceoverDbToMul(settings.high || 0);
		this.lf = 2 * Math.sin(Math.PI * 800 / sampleRate);
		this.hf = 2 * Math.sin(Math.PI * 5000 / sampleRate);
		this.lfDelay = [0, 0, 0, 0];
		this.hfDelay = [0, 0, 0, 0];
		this.sampleDelay = [0, 0, 0];
	}
	process(inputs, outputs) {
		const input = inputs[0];
		const output = outputs[0];
		if (!input || !output || output.length === 0) return true;
		const src = input[0];
		const out = output[0];
		if (!src || !out) return true;
		const lf = this.lfDelay;
		const hf = this.hfDelay;
		const sd = this.sampleDelay;
		for (let i = 0; i < out.length; i++) {
			const x = src[i] || 0;
			/* the epsilon keeps the one pole stages from settling into a dead band */
			lf[0] += this.lf * (x - lf[0]) + 2.3283064e-10;
			lf[1] += this.lf * (lf[0] - lf[1]);
			lf[2] += this.lf * (lf[1] - lf[2]);
			lf[3] += this.lf * (lf[2] - lf[3]);
			const low = lf[3];
			hf[0] += this.hf * (x - hf[0]) + 2.3283064e-10;
			hf[1] += this.hf * (hf[0] - hf[1]);
			hf[2] += this.hf * (hf[1] - hf[2]);
			hf[3] += this.hf * (hf[2] - hf[3]);
			const high = sd[2] - hf[3];
			const mid = sd[2] - (high + low);
			sd[2] = sd[1];
			sd[1] = sd[0];
			sd[0] = x;
			out[i] = low * this.low + mid * this.mid + high * this.high;
		}
		return true;
	}
}
registerProcessor('voiceover-eq', VoiceoverEq);

/*
 * OBS Expander. An RMS envelope over a 10 ms window feeds a dB gain
 * computer that pushes levels under the threshold down by the ratio, with
 * attack and release ballistics smoothing the gain.
 */
class VoiceoverExpander extends AudioWorkletProcessor {
	constructor(options) {
		super();
		const settings = (options && options.processorOptions) || {};
		this.threshold = settings.threshold || 0;
		this.slope = settings.slope || 0;
		this.attack = voiceoverGainCoefficient(settings.attack || 0.01);
		this.release = voiceoverGainCoefficient(settings.release || 0.05);
		this.outputGain = voiceoverDbToMul(settings.outputGain || 0);
		this.peak = settings.detector === 'peak';
		this.rms = Math.pow(2, -100 / sampleRate);
		this.runave = 0;
		this.gainDb = 0;
		this.env = new Float32Array(128);
	}
	process(inputs, outputs) {
		const input = inputs[0];
		const output = outputs[0];
		if (!input || !output || output.length === 0) return true;
		const src = input[0];
		const out = output[0];
		if (!src || !out) return true;
		const frames = out.length;
		if (this.env.length < frames) this.env = new Float32Array(frames);
		const env = this.env;
		let runave = this.runave;
		for (let i = 0; i < frames; i++) {
			const x = src[i] || 0;
			if (this.peak) {
				/* the peak detector keeps the run average but reads the raw level */
				runave = x * x;
				env[i] = Math.abs(x);
			} else {
				runave = this.rms * runave + (1 - this.rms) * x * x;
				env[i] = Math.sqrt(runave > 0 ? runave : 0);
			}
		}
		this.runave = runave;
		let prev = this.gainDb;
		for (let i = 0; i < frames; i++) {
			const diff = this.threshold - voiceoverEnvDb(env[i]);
			const target = diff > 0 ? Math.max(this.slope * diff, -60) : 0;
			if (target > prev) prev = this.attack * prev + (1 - this.attack) * target;
			else prev = this.release * prev + (1 - this.release) * target;
			out[i] = (src[i] || 0) * voiceoverDbToMul(prev < 0 ? prev : 0) * this.outputGain;
		}
		this.gainDb = prev;
		return true;
	}
}
registerProcessor('voiceover-expander', VoiceoverExpander);

/*
 * OBS Compressor and Limiter. A peak envelope with attack and release
 * feeds a dB gain computer. The limiter is the same processor with a unit
 * slope, which is OBS built from the same code.
 */
class VoiceoverDynamics extends AudioWorkletProcessor {
	constructor(options) {
		super();
		const settings = (options && options.processorOptions) || {};
		this.threshold = settings.threshold || 0;
		this.slope = settings.slope || 0;
		this.attack = voiceoverGainCoefficient(settings.attack || 0.006);
		this.release = voiceoverGainCoefficient(settings.release || 0.06);
		this.outputGain = voiceoverDbToMul(settings.outputGain || 0);
		this.envelope = 0;
		this.env = new Float32Array(128);
	}
	process(inputs, outputs) {
		const input = inputs[0];
		const output = outputs[0];
		if (!input || !output || output.length === 0) return true;
		const src = input[0];
		const out = output[0];
		if (!src || !out) return true;
		const frames = out.length;
		if (this.env.length < frames) this.env = new Float32Array(frames);
		const env = this.env;
		let envelope = this.envelope;
		for (let i = 0; i < frames; i++) {
			const level = Math.abs(src[i] || 0);
			if (envelope < level) envelope = level + this.attack * (envelope - level);
			else envelope = level + this.release * (envelope - level);
			env[i] = envelope;
		}
		this.envelope = envelope;
		for (let i = 0; i < frames; i++) {
			let gain = this.slope * (this.threshold - voiceoverEnvDb(env[i]));
			if (gain > 0) gain = 0;
			out[i] = (src[i] || 0) * voiceoverDbToMul(gain) * this.outputGain;
		}
		return true;
	}
}
registerProcessor('voiceover-compressor', VoiceoverDynamics);
registerProcessor('voiceover-limiter', VoiceoverDynamics);
`;

const CAPTURE_NAME = 'voiceover-capture';
const EQ_NAME = 'voiceover-eq';
const EXPANDER_NAME = 'voiceover-expander';
const COMPRESSOR_NAME = 'voiceover-compressor';
const LIMITER_NAME = 'voiceover-limiter';

/* Corner frequencies of the OBS three band split */
export const VOICEOVER_EQ_LOW_HZ = 800;
export const VOICEOVER_EQ_HIGH_HZ = 5000;
/* OBS runs the limiter with a near instant attack */
export const VOICEOVER_LIMITER_ATTACK_SECONDS = 0.000001;

/* Decibel gain computer of the OBS expander, below threshold only */
export function expanderGainDb(envDb: number, threshold: number, slope: number): number {
	const diff = threshold - envDb;
	return diff > 0 ? Math.max(slope * diff, -60) : 0;
}

/* Decibel gain computer of the OBS compressor and limiter, never positive */
export function compressorGainDb(envDb: number, threshold: number, slope: number): number {
	return Math.min(0, slope * (threshold - envDb));
}

/* OBS expander ratio, negative so under threshold levels are pushed down */
export function expanderSlope(ratio: number): number {
	return 1 - ratio;
}

/* OBS compressor ratio, positive so over threshold levels are pulled down */
export function compressorSlope(ratio: number): number {
	return 1 - 1 / ratio;
}

export function gainCoefficient(sampleRate: number, seconds: number): number {
	return Math.exp(-1 / (sampleRate * seconds));
}

export function rmsCoefficient(sampleRate: number): number {
	return Math.pow(2, -100 / sampleRate);
}

export function eqCoefficient(hz: number, sampleRate: number): number {
	return 2 * Math.sin((Math.PI * hz) / sampleRate);
}

/**
 * Keeps every block the worklet posts, growing the storage as the take runs.
 * Samples are appended per channel, so a device that reports two channels is
 * mixed to mono later rather than being dropped here.
 */
export class CaptureBuffer {
	#channels: Float32Array[] = [];
	#frames = 0;

	get channels(): readonly Float32Array[] {
		return this.#channels;
	}

	get frames(): number {
		return this.#frames;
	}

	get empty(): boolean {
		return this.#frames === 0;
	}

	append(block: readonly Float32Array[]): void {
		for (let channel = 0; channel < block.length; channel++) {
			const samples = block[channel];
			const needed = this.#frames + samples.length;
			let target = this.#channels[channel];
			if (target === undefined || target.length < needed) {
				const grown = new Float32Array(needed);
				if (target !== undefined) grown.set(target);
				target = grown;
				this.#channels[channel] = grown;
			}
			target.set(samples, this.#frames);
		}
		this.#frames += block[0]?.length ?? 0;
	}

	clear(): void {
		this.#channels = [];
		this.#frames = 0;
	}
}

/** Loads the voiceover worklets into a context, once per context. */
export async function addCaptureWorklet(context: AudioContext): Promise<void> {
	const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }));
	try {
		await context.audioWorklet.addModule(url);
	} finally {
		URL.revokeObjectURL(url);
	}
}

/*
 * Every filter node is forced to one channel, so a stereo device is mixed
 * down by the graph and the narration stays mono like the rest of the chain.
 */
function filterNode(
	context: AudioContext,
	name: string,
	processorOptions: object
): AudioWorkletNode {
	return new AudioWorkletNode(context, name, {
		numberOfInputs: 1,
		numberOfOutputs: 1,
		outputChannelCount: [1],
		channelCount: 1,
		channelCountMode: 'explicit',
		processorOptions
	});
}

export function createCaptureNode(context: AudioContext): AudioWorkletNode {
	return new AudioWorkletNode(context, CAPTURE_NAME, {
		numberOfInputs: 1,
		numberOfOutputs: 1,
		outputChannelCount: [1]
	});
}

export interface EqNodeSettings {
	low: number;
	mid: number;
	high: number;
}

export function createEqNode(context: AudioContext, settings: EqNodeSettings): AudioWorkletNode {
	return filterNode(context, EQ_NAME, settings);
}

export interface ExpanderNodeSettings {
	threshold: number;
	slope: number;
	attack: number;
	release: number;
	outputGain: number;
	detector: 'rms' | 'peak';
}

export function createExpanderNode(
	context: AudioContext,
	settings: ExpanderNodeSettings
): AudioWorkletNode {
	return filterNode(context, EXPANDER_NAME, settings);
}

export interface DynamicsNodeSettings {
	threshold: number;
	slope: number;
	attack: number;
	release: number;
	outputGain: number;
}

export function createCompressorNode(
	context: AudioContext,
	settings: DynamicsNodeSettings
): AudioWorkletNode {
	return filterNode(context, COMPRESSOR_NAME, settings);
}

export function createLimiterNode(
	context: AudioContext,
	settings: DynamicsNodeSettings
): AudioWorkletNode {
	return filterNode(context, LIMITER_NAME, settings);
}
