import { voiceoverEnd, type VoiceoverClip } from './types.js';

const MAX_SYNC_DRIFT_SECONDS = 0.08;
type SourceResolver = (clip: VoiceoverClip) => Promise<string>;

export class VoiceoverAudioController {
	#audio: HTMLAudioElement | null = null;
	#clips: readonly VoiceoverClip[] = [];
	#duration = 0;
	#activeId: string | null = null;
	#sourceResolver: SourceResolver | null = null;
	#sourceUrls = new Map<string, string>();
	#loadingSources = new Map<string, Promise<string>>();
	#sourceFailed = new Set<string>();
	#pendingTime = 0;
	#playing = false;
	#playbackRate = 1;
	#destroyed = false;

	constructor() {
		if (typeof Audio !== 'undefined') this.#audio = new Audio();
	}

	load(clips: readonly VoiceoverClip[], duration: number, sourceResolver: SourceResolver): void {
		this.#clips = [...clips];
		this.#duration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
		this.#sourceResolver = sourceResolver;
		this.#sourceFailed.clear();
		this.#stopActive();
	}

	sync(timeSeconds: number, playing: boolean, playbackRate = this.#playbackRate): void {
		if (this.#destroyed || this.#audio === null || this.#duration <= 0) return;

		const time = Math.max(0, Math.min(this.#duration, timeSeconds));
		this.#playing = playing;
		this.#playbackRate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
		const clip = this.#clipAt(time);
		if (clip === null) {
			this.#stopActive();
			return;
		}

		const localTime = Math.max(0, Math.min(clip.duration, time - clip.start));
		this.#pendingTime = localTime;
		if (this.#activeId !== clip.id) this.#activate(clip, localTime);
		this.#audio.playbackRate = this.#playbackRate;
		if (Math.abs(this.#audio.currentTime - localTime) > MAX_SYNC_DRIFT_SECONDS) {
			this.#setCurrentTime(localTime);
		}
		if (playing) void this.#audio.play().catch(() => undefined);
		else this.#audio.pause();
	}

	stop(): void {
		this.#playing = false;
		this.#stopActive();
	}

	destroy(): void {
		this.#destroyed = true;
		this.#playing = false;
		this.#stopActive();
		for (const url of this.#sourceUrls.values()) URL.revokeObjectURL(url);
		this.#sourceUrls.clear();
		this.#audio = null;
	}

	#clipAt(time: number): VoiceoverClip | null {
		return (
			this.#clips.find((clip) => time >= clip.start - 1e-9 && time < voiceoverEnd(clip) - 1e-9) ??
			null
		);
	}

	#activate(clip: VoiceoverClip, localTime: number): void {
		const audio = this.#audio;
		if (audio === null) return;
		audio.pause();
		this.#activeId = clip.id;
		this.#pendingTime = localTime;
		this.#sourceFailed.delete(clip.id);
		const cached = this.#sourceUrls.get(clip.id);
		if (cached !== undefined) {
			this.#setSource(audio, clip, cached);
			return;
		}

		const loading = this.#loadingSources.get(clip.id) ?? this.#loadSource(clip);
		void loading
			.then((url) => {
				if (this.#destroyed || this.#activeId !== clip.id || this.#audio === null) return;
				this.#setSource(this.#audio, clip, url);
				if (this.#playing) void this.#audio.play().catch(() => undefined);
			})
			.catch(() => {
				this.#loadingSources.delete(clip.id);
				this.#sourceFailed.add(clip.id);
			});
	}

	#loadSource(clip: VoiceoverClip): Promise<string> {
		if (this.#sourceResolver === null)
			return Promise.reject(new Error('Voiceover source is unavailable'));
		const loading = this.#sourceResolver(clip).then((url) => {
			this.#sourceUrls.set(clip.id, url);
			this.#loadingSources.delete(clip.id);
			return url;
		});
		this.#loadingSources.set(clip.id, loading);
		return loading;
	}

	#setSource(audio: HTMLAudioElement, clip: VoiceoverClip, url: string): void {
		audio.src = url;
		audio.load();
		audio.playbackRate = this.#playbackRate;
		audio.addEventListener(
			'loadedmetadata',
			() => {
				if (this.#activeId === clip.id) this.#setCurrentTime(this.#pendingTime);
			},
			{ once: true }
		);
	}

	#setCurrentTime(time: number): void {
		const audio = this.#audio;
		if (audio === null) return;
		try {
			audio.currentTime = time;
		} catch {
			this.#pendingTime = time;
		}
	}

	#stopActive(): void {
		const audio = this.#audio;
		this.#activeId = null;
		this.#playing = false;
		if (audio === null) return;
		audio.pause();
		try {
			audio.currentTime = 0;
		} catch {
			return;
		}
		audio.removeAttribute('src');
		audio.load();
	}
}
