import { mixSoundCues, SOUND_SAMPLE_RATE, type SoundCue } from './sound.js';

const MAX_SYNC_DRIFT_SECONDS = 0.05;

type AudioContextConstructor = new () => AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | null {
	if (typeof AudioContext !== 'undefined') return AudioContext;

	const fallback = (
		globalThis as typeof globalThis & { webkitAudioContext?: AudioContextConstructor }
	).webkitAudioContext;
	return fallback ?? null;
}

export class AudioController {
	#context: AudioContext | null = null;
	#buffer: AudioBuffer | null = null;
	#cues: readonly SoundCue[] = [];
	#duration = 0;
	#offset = 0;
	#playing = false;
	#source: AudioBufferSourceNode | null = null;
	#sourceOffset = 0;
	#sourceStartedAt = 0;
	#playbackRate = 1;
	#revision = 0;
	#playRequested = false;
	#playPending = false;
	#destroyed = false;

	get currentTime(): number {
		if (!this.#playing || !this.#source) {
			return this.#offset;
		}

		const elapsed =
			this.#context === null ? 0 : Math.max(0, this.#context.currentTime - this.#sourceStartedAt);
		return this.#clampTime(this.#sourceOffset + elapsed * this.#playbackRate);
	}

	get duration(): number {
		return this.#duration;
	}

	get playing(): boolean {
		return this.#playing;
	}

	load(cues: readonly SoundCue[], durationSeconds: number): void {
		this.#revision++;
		this.#playRequested = false;
		this.#playPending = false;
		this.#stopSource();
		this.#cues = [...cues];
		this.#duration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
		this.#offset = 0;
		this.#playbackRate = 1;
		this.#buffer = null;
	}

	async unlock(): Promise<boolean> {
		if (this.#destroyed) return false;
		const Context = getAudioContextConstructor();
		if (Context === null) return false;

		try {
			this.#context ??= new Context();
			if (this.#context.state !== 'running') {
				await this.#context.resume();
			}
		} catch {
			return false;
		}

		if (
			!this.#destroyed &&
			this.#context?.state === 'running' &&
			this.#playRequested &&
			this.#source === null &&
			!this.#playPending
		) {
			this.#startSource(this.#offset);
		}

		return !this.#destroyed && this.#context?.state === 'running';
	}

	sync(timeSeconds: number, playing: boolean, playbackRate = this.#playbackRate): void {
		const target = this.#clampTime(timeSeconds);
		this.#setPlaybackRate(playbackRate);

		if (!playing) {
			this.#revision++;
			this.#playRequested = false;
			this.#playPending = false;
			this.#stopSource();
			this.#offset = target;
			return;
		}

		this.#offset = target;
		this.#playRequested = true;

		if (this.#destroyed || this.#duration === 0 || this.#context?.state !== 'running') {
			return;
		}

		if (target >= this.#duration) {
			this.#revision++;
			this.#playRequested = false;
			this.#playPending = false;
			this.#stopSource();
			return;
		}

		if (this.#source !== null && Math.abs(target - this.currentTime) <= MAX_SYNC_DRIFT_SECONDS) {
			return;
		}

		this.#revision++;
		this.#startSource(target);
	}

	async play(offsetSeconds?: number, playbackRate = this.#playbackRate): Promise<void> {
		if (this.#destroyed) {
			return;
		}

		const revision = ++this.#revision;
		const offset = this.#clampTime(offsetSeconds ?? this.currentTime);
		this.#offset = offset;
		this.#playRequested = true;
		this.#playPending = true;
		this.#setPlaybackRate(playbackRate);

		if (this.#duration === 0) {
			this.#playRequested = false;
			this.#playPending = false;
			this.#stopSource();
			return;
		}

		if (!(await this.unlock())) {
			if (revision === this.#revision) {
				this.#playRequested = false;
				this.#playPending = false;
			}
			this.#stopSource();
			return;
		}

		if (!this.#destroyed && revision === this.#revision) {
			this.#playPending = false;
			this.#startSource(this.#offset);
		}
	}

	pause(): void {
		this.#revision++;
		this.#playRequested = false;
		this.#playPending = false;
		if (this.#source !== null) {
			this.#offset = this.currentTime;
		}

		this.#stopSource();
	}

	seek(seconds: number): void {
		this.#revision++;
		this.#playRequested = false;
		this.#playPending = false;
		const target = this.#clampTime(seconds);
		this.#offset = target;

		if (!this.#playing) {
			return;
		}

		if (this.#context?.state !== 'running') {
			this.#stopSource();
			return;
		}

		this.#playRequested = true;
		this.#startSource(target);
	}

	stop(): void {
		this.#revision++;
		this.#playRequested = false;
		this.#playPending = false;
		this.#stopSource();
		this.#offset = 0;
	}

	destroy(): void {
		this.#revision++;
		this.#destroyed = true;
		this.stop();
		this.#buffer = null;

		const context = this.#context;
		this.#context = null;
		if (context === null || context.state === 'closed') {
			return;
		}

		try {
			void context.close().catch(() => undefined);
		} catch {
			return;
		}
	}

	#clampTime(seconds: number): number {
		if (Number.isNaN(seconds)) {
			return this.#offset;
		}

		return Math.max(0, Math.min(this.#duration, seconds));
	}

	#setPlaybackRate(playbackRate: number) {
		const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
		if (rate === this.#playbackRate) return;

		if (this.#source !== null && this.#playing && this.#context !== null) {
			this.#sourceOffset = this.currentTime;
			this.#sourceStartedAt = this.#context.currentTime;
			this.#source.playbackRate.value = rate;
		}

		this.#playbackRate = rate;
	}

	#ensureBuffer(): AudioBuffer | null {
		if (
			this.#context === null ||
			this.#context.state !== 'running' ||
			this.#duration === 0 ||
			this.#cues.length === 0
		) {
			return null;
		}

		if (this.#buffer !== null) {
			return this.#buffer;
		}

		const samples = mixSoundCues(this.#cues, this.#duration, SOUND_SAMPLE_RATE);
		if (samples.length === 0) {
			return null;
		}

		const buffer = this.#context.createBuffer(1, samples.length, SOUND_SAMPLE_RATE);
		buffer.getChannelData(0).set(samples);
		this.#buffer = buffer;
		return buffer;
	}

	#startSource(offset: number): void {
		const context = this.#context;
		const buffer = this.#ensureBuffer();
		if (context === null || buffer === null) {
			this.#playRequested = false;
			this.#playing = false;
			return;
		}

		this.#stopSource();
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.connect(context.destination);
		this.#source = source;
		this.#sourceOffset = this.#clampTime(offset);
		this.#sourceStartedAt = context.currentTime;
		source.playbackRate.value = this.#playbackRate;
		this.#playing = true;

		source.onended = () => {
			if (this.#source !== source) {
				return;
			}

			this.#source = null;
			this.#playRequested = false;
			this.#playing = false;
			this.#offset = this.#duration;
			try {
				source.disconnect();
			} catch {
				return;
			}
		};

		try {
			source.start(this.#sourceStartedAt, this.#sourceOffset);
		} catch {
			if (this.#source === source) {
				this.#source = null;
			}
			this.#playRequested = false;
			this.#playing = false;
		}
	}

	#stopSource(): void {
		const source = this.#source;
		this.#source = null;
		this.#playing = false;

		if (source === null) {
			return;
		}

		source.onended = null;
		try {
			source.stop();
		} catch {
			return;
		}
		try {
			source.disconnect();
		} catch {
			return;
		}
	}
}
