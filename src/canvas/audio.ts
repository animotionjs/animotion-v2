export interface AudioOptions {
	at?: number;
	volume?: number;
	loop?: boolean;
	duration?: number | null;
}

export interface AudioCue {
	src: string;
	at: number;
	volume: number;
	loop: boolean;
	duration: number | null;
}

export class AudioPlayer {
	#cues: AudioCue[] = [];
	#elements: HTMLAudioElement[] = [];

	load(cues: readonly AudioCue[]) {
		this.stop();
		this.#cues = [...cues];
		this.#elements = cues.map((cue) => {
			const audio = new Audio(cue.src);
			audio.volume = cue.volume;
			audio.loop = cue.loop;
			audio.preload = 'auto';
			return audio;
		});
	}

	sync(time: number, playing: boolean) {
		if (!playing) {
			this.pause();
			return;
		}

		this.#cues.forEach((cue, index) => {
			const audio = this.#elements[index];
			if (!audio) return;

			const local = time - cue.at;
			const end = cue.duration ?? Infinity;
			const active = local >= 0 && local < end;

			if (!active) {
				if (!audio.paused) audio.pause();
				return;
			}

			if (Math.abs(audio.currentTime - local) > 0.15) audio.currentTime = local;
			if (audio.paused) void audio.play().catch(() => {});
		});
	}

	pause() {
		for (const audio of this.#elements) {
			if (!audio.paused) audio.pause();
		}
	}

	stop() {
		for (const audio of this.#elements) {
			audio.pause();
			audio.currentTime = 0;
		}
	}
}
