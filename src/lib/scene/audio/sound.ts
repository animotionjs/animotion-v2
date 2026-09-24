export const SOUND_NAMES = ['click', 'pop', 'chime', 'whoosh', 'riser', 'impact'] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

export interface SoundOptions {
	at?: number;
	delay?: number;
	duration?: number;
	volume?: number;
	pitch?: number;
	seed?: number;
	fadeIn?: number;
	fadeOut?: number;
}

export interface SoundCue {
	name: SoundName;
	at: number;
	duration: number;
	volume: number;
	pitch: number;
	seed: number;
	fadeIn: number;
	fadeOut: number;
}

export const SOUND_SAMPLE_RATE = 48000;

const TWO_PI = Math.PI * 2;
const DEFAULT_FADE_IN = 0.005;
const DEFAULT_FADE_OUT = 0.04;

const SOUND_DURATIONS: Record<SoundName, number> = {
	click: 0.12,
	pop: 0.22,
	chime: 0.9,
	whoosh: 0.55,
	riser: 1.2,
	impact: 0.7
};

type Voice = (time: number, progress: number) => number;
type VoiceFactory = (cue: SoundCue, sampleRate: number) => Voice;

function clamp(value: number): number {
	if (value === 0) {
		return 0;
	}

	return Math.max(-1, Math.min(1, value));
}

function validateName(name: SoundName): void {
	if (!SOUND_NAMES.includes(name)) {
		throw new RangeError(`Unknown sound name: ${String(name)}`);
	}
}

function validateNonnegative(value: number, label: string): void {
	if (!Number.isFinite(value) || value < 0) {
		throw new RangeError(`${label} must be a finite nonnegative number`);
	}
}

function validatePositive(value: number, label: string): void {
	if (!Number.isFinite(value) || value <= 0) {
		throw new RangeError(`${label} must be a finite positive number`);
	}
}

function validateCue(cue: SoundCue): void {
	validateName(cue.name);
	validateNonnegative(cue.at, 'at');
	validatePositive(cue.duration, 'duration');
	validateNonnegative(cue.fadeIn, 'fadeIn');
	validateNonnegative(cue.fadeOut, 'fadeOut');

	if (!Number.isFinite(cue.volume) || cue.volume < 0 || cue.volume > 1) {
		throw new RangeError('volume must be a finite number from 0 to 1');
	}

	validatePositive(cue.pitch, 'pitch');

	if (!Number.isInteger(cue.seed)) {
		throw new RangeError('seed must be an integer');
	}

	if (cue.fadeIn + cue.fadeOut - cue.duration > 1e-9) {
		throw new RangeError('fadeIn and fadeOut must fit within duration');
	}
}

function validateSampleRate(sampleRate: number): void {
	if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
		throw new RangeError('sampleRate must be a positive integer');
	}
}

function createPhase(seed: number): number {
	const normalizedSeed = ((seed % 4096) + 4096) % 4096;
	return (normalizedSeed / 4096) * TWO_PI;
}

const VOICE_FACTORIES: Record<SoundName, VoiceFactory> = {
	click: (cue, sampleRate) => {
		let phase = createPhase(cue.seed);

		return (time) => {
			const frequency = 1550 * cue.pitch;
			const envelope = (1 - Math.exp(-time * 900)) * Math.exp(-time * 48);
			phase += (TWO_PI * frequency) / sampleRate;

			return (0.68 * Math.sin(phase) + 0.2 * Math.sin(phase * 2)) * envelope;
		};
	},
	pop: (cue, sampleRate) => {
		let phase = createPhase(cue.seed);

		return (time) => {
			const frequency = (150 + 420 * Math.exp(-time * 12)) * cue.pitch;
			const envelope = (1 - Math.exp(-time * 180)) * Math.exp(-time * 14);
			phase += (TWO_PI * frequency) / sampleRate;

			return (Math.sin(phase) + 0.18 * Math.sin(phase * 2)) * envelope;
		};
	},
	chime: (cue, sampleRate) => {
		let firstPhase = createPhase(cue.seed);
		let secondPhase = firstPhase * 1.618;
		let thirdPhase = firstPhase * 2.414;

		return (time) => {
			firstPhase += (TWO_PI * 523.25 * cue.pitch) / sampleRate;
			secondPhase += (TWO_PI * 659.25 * cue.pitch) / sampleRate;
			thirdPhase += (TWO_PI * 783.99 * cue.pitch) / sampleRate;

			const envelope = (1 - Math.exp(-time * 35)) * Math.exp(-time * 2.4);
			const partials =
				0.5 * Math.sin(firstPhase) +
				0.3 * Math.sin(secondPhase) +
				0.2 * Math.sin(thirdPhase) +
				0.06 * Math.sin(thirdPhase * 2);

			return partials * envelope;
		};
	},
	whoosh: (cue, sampleRate) => {
		const seedPhase = createPhase(cue.seed);
		let fundamentalPhase = seedPhase;
		let harmonicPhase = seedPhase * 1.5;
		let overtonePhase = seedPhase * 2.25;
		const brightness = Math.min(cue.pitch, 4);

		return (time, progress) => {
			const sweep = (1 - progress) ** 2;
			const frequency = (80 + 280 * sweep) * brightness;
			fundamentalPhase += (TWO_PI * frequency) / sampleRate;
			harmonicPhase += (TWO_PI * frequency * 2) / sampleRate;
			overtonePhase += (TWO_PI * frequency * 3) / sampleRate;

			const envelope = Math.sin(Math.PI * progress) ** 2;
			const drift = 0.9 + 0.1 * Math.sin(TWO_PI * time * 1.7);
			const body =
				0.5 * Math.sin(fundamentalPhase) +
				0.3 * Math.sin(harmonicPhase) +
				0.2 * Math.sin(overtonePhase);

			return body * envelope * drift;
		};
	},
	riser: (cue, sampleRate) => {
		let phase = createPhase(cue.seed);

		return (_time, progress) => {
			const frequency = (110 + 790 * progress ** 2) * cue.pitch;
			const envelope = progress ** 2 * (0.75 + 0.25 * progress);
			phase += (TWO_PI * frequency) / sampleRate;

			return (0.72 * Math.sin(phase) + 0.2 * Math.sin(phase * 2)) * envelope;
		};
	},
	impact: (cue, sampleRate) => {
		const seedPhase = createPhase(cue.seed);
		let fundamentalPhase = seedPhase;
		let harmonicPhase = seedPhase * 0.5;
		let overtonePhase = seedPhase * 0.25;

		return (time) => {
			const frequency = (45 + 95 * Math.exp(-time * 8)) * cue.pitch;
			const envelope = (1 - Math.exp(-time * 350)) * Math.exp(-time * 5.5);
			fundamentalPhase += (TWO_PI * frequency) / sampleRate;
			harmonicPhase += (TWO_PI * frequency * 2) / sampleRate;
			overtonePhase += (TWO_PI * frequency * 3) / sampleRate;

			const body =
				0.78 * Math.sin(fundamentalPhase) +
				0.16 * Math.sin(harmonicPhase) +
				0.06 * Math.sin(overtonePhase);

			return body * envelope;
		};
	}
};

export function createSoundCue(
	name: SoundName,
	options: SoundOptions = {},
	defaultSeed = 1
): SoundCue {
	validateName(name);

	if (options.at !== undefined && options.delay !== undefined) {
		throw new RangeError('at and delay cannot be used together');
	}

	if (options.delay !== undefined) {
		validateNonnegative(options.delay, 'delay');
	}

	let at = 0;
	if (options.at !== undefined) {
		at = options.at;
	} else if (options.delay !== undefined) {
		at = options.delay;
	}

	const duration = options.duration === undefined ? SOUND_DURATIONS[name] : options.duration;
	const cue: SoundCue = {
		name,
		at,
		duration,
		volume: options.volume === undefined ? 1 : options.volume,
		pitch: options.pitch === undefined ? 1 : options.pitch,
		seed: options.seed === undefined ? defaultSeed : options.seed,
		fadeIn: options.fadeIn === undefined ? Math.min(DEFAULT_FADE_IN, duration / 3) : options.fadeIn,
		fadeOut:
			options.fadeOut === undefined ? Math.min(DEFAULT_FADE_OUT, duration / 3) : options.fadeOut
	};

	validateCue(cue);
	return cue;
}

export function synthesizeSound(cue: SoundCue, sampleRate = SOUND_SAMPLE_RATE): Float32Array {
	validateSampleRate(sampleRate);
	validateCue(cue);

	const sampleCount = Math.max(1, Math.round(cue.duration * sampleRate));
	const samples = new Float32Array(sampleCount);
	const voice = VOICE_FACTORIES[cue.name](cue, sampleRate);

	for (let index = 0; index < sampleCount; index++) {
		const time = index / sampleRate;
		const progress = time / cue.duration;
		const fadeInGain = cue.fadeIn === 0 ? 1 : Math.min(time / cue.fadeIn, 1);
		const remaining = (sampleCount - 1 - index) / sampleRate;
		const fadeOutGain = cue.fadeOut === 0 ? 1 : Math.min(remaining / cue.fadeOut, 1);
		const value = voice(time, progress) * cue.volume * fadeInGain * fadeOutGain;

		samples[index] = clamp(value);
	}

	return samples;
}

export function mixSoundCues(
	cues: readonly SoundCue[],
	durationSeconds: number,
	sampleRate = SOUND_SAMPLE_RATE
): Float32Array {
	validateSampleRate(sampleRate);

	if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
		throw new RangeError('durationSeconds must be a finite nonnegative number');
	}

	const mixed = new Float32Array(Math.round(durationSeconds * sampleRate));

	for (const cue of cues) {
		validateCue(cue);
		const offset = Math.round(cue.at * sampleRate);

		if (offset >= mixed.length) {
			continue;
		}

		const samples = synthesizeSound(cue, sampleRate);
		const mixCount = Math.min(samples.length, mixed.length - offset);

		for (let index = 0; index < mixCount; index++) {
			mixed[offset + index] = clamp(mixed[offset + index] + samples[index]);
		}
	}

	return mixed;
}

export function encodePcm16(samples: Float32Array): Int16Array {
	const encoded = new Int16Array(samples.length);

	for (let index = 0; index < samples.length; index++) {
		const sample = Number.isNaN(samples[index]) ? 0 : clamp(samples[index]);
		const scale = sample < 0 ? 32768 : 32767;
		encoded[index] = Math.round(sample * scale);
	}

	return encoded;
}
