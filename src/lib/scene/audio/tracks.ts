export interface AudioOptions {
	at?: number;
	delay?: number;
	volume?: number;
	rate?: number;
	loop?: boolean;
	trimStart?: number;
	duration?: number;
	fadeIn?: number;
	fadeOut?: number;
}

export interface AudioTrack {
	src: string;
	at: number;
	volume: number;
	rate: number;
	loop: boolean;
	trimStart: number;
	duration: number | null;
	fadeIn: number;
	fadeOut: number;
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

export function validateAudioTrack(track: AudioTrack): void {
	if (typeof track.src !== 'string' || track.src.length === 0) {
		throw new RangeError('src must be a non-empty string');
	}
	validateNonnegative(track.at, 'at');
	if (!Number.isFinite(track.volume) || track.volume < 0 || track.volume > 1) {
		throw new RangeError('volume must be a finite number from 0 to 1');
	}
	validatePositive(track.rate, 'rate');
	validateNonnegative(track.trimStart, 'trimStart');
	if (track.duration !== null) validatePositive(track.duration, 'duration');
	validateNonnegative(track.fadeIn, 'fadeIn');
	validateNonnegative(track.fadeOut, 'fadeOut');
	if (track.duration !== null && track.fadeIn + track.fadeOut > track.duration) {
		throw new RangeError('fadeIn and fadeOut combined must not exceed duration');
	}
}

export function createAudioTrack(src: string, options: AudioOptions = {}): AudioTrack {
	if (typeof src !== 'string' || src.length === 0) {
		throw new RangeError('src must be a non-empty string');
	}
	if (options.at !== undefined && options.delay !== undefined) {
		throw new RangeError('at and delay cannot be used together');
	}
	if (options.delay !== undefined) validateNonnegative(options.delay, 'delay');

	let at = 0;
	if (options.at !== undefined) {
		at = options.at;
	} else if (options.delay !== undefined) {
		at = options.delay;
	}

	const track: AudioTrack = {
		src,
		at,
		volume: options.volume === undefined ? 1 : options.volume,
		rate: options.rate === undefined ? 1 : options.rate,
		loop: options.loop === undefined ? false : options.loop,
		trimStart: options.trimStart === undefined ? 0 : options.trimStart,
		duration: options.duration === undefined ? null : options.duration,
		fadeIn: options.fadeIn === undefined ? 0 : options.fadeIn,
		fadeOut: options.fadeOut === undefined ? 0 : options.fadeOut
	};

	validateAudioTrack(track);
	return track;
}
