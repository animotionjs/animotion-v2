import { fadeGain } from './fades.js';
import type { AudioTrack } from './tracks.js';

const FILE_SYNC_DRIFT_SECONDS = 0.25;
// seeking exactly to the end stalls some decoders, so previews stop short
const FILE_END_GUARD_SECONDS = 0.05;
// automation smooths gain between frames so fades never step
const FADE_TIME_CONSTANT_SECONDS = 0.025;

interface FileVoice {
	track: AudioTrack;
	el: HTMLAudioElement | null;
	gain: GainNode | null;
	source: MediaElementAudioSourceNode | null;
}

export class AudioController {
	#tracks: readonly AudioTrack[] = [];
	#files: FileVoice[] = [];
	#duration = 0;
	#offset = 0;
	#playbackRate = 1;
	#playRequested = false;
	#destroyed = false;
	#audioCtx: AudioContext | null = null;

	get currentTime(): number {
		return this.#offset;
	}

	get duration(): number {
		return this.#duration;
	}

	load(tracks: readonly AudioTrack[], durationSeconds: number): void {
		this.#playRequested = false;
		this.#pauseFiles();
		this.#teardownFiles();
		this.#tracks = [...tracks];
		this.#duration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
		this.#offset = 0;
		this.#playbackRate = 1;
		this.#setupFiles();
	}

	async unlock(): Promise<boolean> {
		if (this.#destroyed) return false;
		if (typeof Audio === 'undefined') return false;
		// start fetching inside the user gesture so first play has data ready
		for (const file of this.#files) {
			try {
				file.el?.load();
			} catch {
				continue;
			}
		}
		// the context starts suspended until a gesture resumes it
		const ctx = this.#audioCtx;
		if (ctx) {
			try {
				if (ctx.state === 'suspended') await ctx.resume();
			} catch {
				return false;
			}
			if (ctx.state === 'suspended') return false;
		}
		if (this.#playRequested) {
			this.#syncFiles(this.#offset, true, this.#playbackRate);
		}
		return true;
	}

	sync(timeSeconds: number, playing: boolean, playbackRate = this.#playbackRate): void {
		const target = this.#clampTime(timeSeconds);
		const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
		this.#playbackRate = rate;

		if (!playing) {
			this.#playRequested = false;
			this.#offset = target;
			this.#syncFiles(target, false, rate);
			return;
		}

		this.#offset = target;
		this.#playRequested = true;
		if (!this.#destroyed && this.#duration !== 0 && target < this.#duration) {
			this.#syncFiles(target, true, rate);
		} else {
			this.#syncFiles(target, false, rate);
		}
	}

	async play(offsetSeconds?: number, playbackRate = this.#playbackRate): Promise<void> {
		if (this.#destroyed) return;
		const offset = this.#clampTime(offsetSeconds ?? this.#offset);
		this.#offset = offset;
		this.#playRequested = true;
		const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
		this.#playbackRate = rate;
		if (this.#duration === 0) {
			this.#playRequested = false;
			return;
		}
		this.#syncFiles(offset, true, rate);
	}

	pause(): void {
		this.#playRequested = false;
		this.#syncFiles(this.#offset, false, this.#playbackRate);
	}

	seek(seconds: number): void {
		this.#playRequested = false;
		const target = this.#clampTime(seconds);
		this.#offset = target;
		this.#syncFiles(target, false, this.#playbackRate);
	}

	stop(): void {
		this.#playRequested = false;
		this.#pauseFiles();
		this.#offset = 0;
	}

	destroy(): void {
		this.#destroyed = true;
		this.stop();
		this.#teardownFiles();
		const ctx = this.#audioCtx;
		this.#audioCtx = null;
		if (ctx) {
			try {
				ctx.close().catch(() => undefined);
			} catch {
				return;
			}
		}
	}

	#clampTime(seconds: number): number {
		if (Number.isNaN(seconds)) {
			return this.#offset;
		}

		return Math.max(0, Math.min(this.#duration, seconds));
	}

	#getContext(): AudioContext | null {
		if (this.#destroyed) return null;
		if (this.#audioCtx) return this.#audioCtx;
		const globals = globalThis as unknown as {
			AudioContext?: typeof AudioContext;
			webkitAudioContext?: typeof AudioContext;
		};
		const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : globals.webkitAudioContext;
		if (!Ctor) return null;
		try {
			this.#audioCtx = new Ctor();
		} catch {
			return null;
		}
		return this.#audioCtx;
	}

	#setupFiles(): void {
		this.#files = this.#tracks.map((track) => {
			if (typeof Audio === 'undefined') return { track, el: null, gain: null, source: null };
			try {
				const el = new Audio(track.src);
				el.preload = 'auto';
				el.volume = track.volume;
				el.playbackRate = this.#playbackRate * track.rate;
				// pitch must shift with speed or preview and render sound different
				el.preservesPitch = false;
				el.loop = track.loop;
				/** The gain node carries the fade so it stays smooth. Element volume is the fallback without a context. */
				const ctx = this.#getContext();
				if (!ctx) return { track, el, gain: null, source: null };
				const gain = ctx.createGain();
				gain.gain.value = 1;
				const source = ctx.createMediaElementSource(el);
				source.connect(gain).connect(ctx.destination);
				return { track, el, gain, source };
			} catch {
				return { track, el: null, gain: null, source: null };
			}
		});
	}

	#teardownFiles(): void {
		for (const file of this.#files) {
			try {
				file.source?.disconnect();
				file.gain?.disconnect();
				file.el?.pause();
				if (file.el) file.el.removeAttribute('src');
			} catch {
				continue;
			}
		}
		this.#files = [];
	}

	#pauseFiles(): void {
		for (const file of this.#files) {
			const el = file.el;
			if (!el) continue;
			try {
				el.pause();
			} catch {
				continue;
			}
		}
	}

	/**
	 * Sync runs every frame so volume stays smooth with no timer involved.
	 */
	#syncFiles(time: number, playing: boolean, timelineRate: number): void {
		for (const file of this.#files) {
			this.#syncFile(file, time, playing, timelineRate);
		}
	}

	/** Moves one file to the timeline position, pausing outside its window. */
	#syncFile(file: FileVoice, time: number, playing: boolean, timelineRate: number): void {
		const el = file.el;
		const track = file.track;
		if (!el) return;
		const effectiveRate =
			Number.isFinite(timelineRate) && timelineRate > 0 ? timelineRate * track.rate : track.rate;
		const local = time - track.at;
		try {
			/** Level stays on the element. The fade uses the gain node when one exists. */
			el.volume = track.volume;
			el.playbackRate = effectiveRate;
			el.loop = track.loop;
			const ctx = this.#audioCtx;
			if (file.gain && ctx) {
				file.gain.gain.setTargetAtTime(
					fadeGain(track, local, this.#duration),
					ctx.currentTime,
					FADE_TIME_CONSTANT_SECONDS
				);
			} else {
				el.volume = track.volume * fadeGain(track, local, this.#duration);
			}
		} catch {
			return;
		}

		const fileDuration = Number.isFinite(el.duration) ? el.duration : Number.NaN;
		const fileLength = Number.isFinite(fileDuration)
			? Math.max(0, (fileDuration - track.trimStart) / track.rate)
			: Number.POSITIVE_INFINITY;
		let sceneLength: number;
		if (track.duration !== null && !track.loop) {
			/** The file can end before the sound does, so stop here to avoid replaying the tail. */
			sceneLength = Math.min(track.duration, fileLength);
		} else if (track.duration !== null) {
			sceneLength = track.duration;
		} else if (track.loop) {
			sceneLength = Math.max(0, this.#duration - track.at);
		} else {
			sceneLength = fileLength;
		}

		if (!playing || local < 0 || local >= sceneLength) {
			try {
				if (!el.paused) el.pause();
				if (local >= 0 && local < sceneLength && Number.isFinite(fileDuration)) {
					const preview = track.trimStart + local * track.rate;
					if (Math.abs(el.currentTime - preview) > FILE_SYNC_DRIFT_SECONDS) {
						el.currentTime = Math.min(preview, Math.max(0, fileDuration - FILE_END_GUARD_SECONDS));
					}
				} else if (local < 0) {
					if (el.currentTime !== track.trimStart) el.currentTime = track.trimStart;
				}
			} catch {
				return;
			}
			return;
		}

		let target = track.trimStart + local * track.rate;
		if (track.loop && Number.isFinite(fileDuration) && fileDuration > track.trimStart) {
			const span = fileDuration - track.trimStart;
			target = track.trimStart + ((local * track.rate) % span);
		}
		try {
			if (el.paused) {
				if (Number.isFinite(fileDuration)) {
					el.currentTime = Math.min(target, Math.max(0, fileDuration - FILE_END_GUARD_SECONDS));
				}
				el.play().catch(() => undefined);
			} else if (Number.isFinite(fileDuration)) {
				if (Math.abs(el.currentTime - target) > FILE_SYNC_DRIFT_SECONDS) {
					el.currentTime = Math.min(target, Math.max(0, fileDuration - FILE_END_GUARD_SECONDS));
				}
			} else {
				el.play().catch(() => undefined);
			}
		} catch {
			return;
		}
	}
}
