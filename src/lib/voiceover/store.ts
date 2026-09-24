import {
	deleteRecordedVoiceover,
	loadVoiceovers,
	moveRecordedVoiceover,
	readRecordedVoiceover,
	saveRecordedVoiceover
} from './remote.js';
import { sortVoiceoverClips, type VoiceoverClip, type VoiceoverRecording } from './types.js';

export type VoiceoverStoreListener = (clips: readonly VoiceoverClip[]) => void;

async function blobToBase64(blob: Blob): Promise<string> {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = '';
	const chunkSize = 0x8000;
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		const chunk = bytes.subarray(offset, offset + chunkSize);
		for (const byte of chunk) binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function base64ToBlob(data: string, mime: string): Blob {
	const binary = atob(data);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
	return new Blob([bytes], { type: mime });
}

function recordingId(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
	return `recording-${Date.now()}`;
}

function nextLabel(clips: readonly VoiceoverClip[]): number {
	return clips.reduce((highest, clip) => {
		const match = /^Recording (\d+)$/.exec(clip.label);
		return match ? Math.max(highest, Number(match[1]) + 1) : highest;
	}, 1);
}

export class VoiceoverStore {
	#sceneId: string;
	#timelineFps: number;
	#clips: VoiceoverClip[] = [];
	#revision = 0;
	#nextLabel = 1;
	#listeners = new Set<VoiceoverStoreListener>();

	constructor(sceneId: string, timelineFps: number) {
		this.#sceneId = sceneId;
		this.#timelineFps = timelineFps;
	}

	get clips(): readonly VoiceoverClip[] {
		return this.#clips;
	}

	get timelineFps(): number {
		return this.#timelineFps;
	}

	subscribe(listener: VoiceoverStoreListener) {
		this.#listeners.add(listener);
		listener(this.#clips);
		return () => this.#listeners.delete(listener);
	}

	async load(sceneId = this.#sceneId): Promise<void> {
		const revision = ++this.#revision;
		this.#sceneId = sceneId;
		const manifest = await loadVoiceovers({ sceneId });
		if (revision !== this.#revision) return;
		this.#clips = sortVoiceoverClips(manifest.clips);
		this.#nextLabel = nextLabel(this.#clips);
		this.#emit();
	}

	async add(recording: VoiceoverRecording, start: number): Promise<VoiceoverClip> {
		++this.#revision;
		const clip = await saveRecordedVoiceover({
			sceneId: this.#sceneId,
			id: recordingId(),
			label: `Recording ${this.#nextLabel++}`,
			timelineFps: this.#timelineFps,
			start,
			duration: recording.duration,
			mime: recording.mime,
			data: await blobToBase64(recording.blob)
		});
		this.#clips = sortVoiceoverClips([...this.#clips, clip]);
		this.#emit();
		return clip;
	}

	async move(id: string, start: number): Promise<VoiceoverClip> {
		++this.#revision;
		const previous = this.#clips;
		const optimistic = previous.map((clip) => (clip.id === id ? { ...clip, start } : clip));
		this.#clips = sortVoiceoverClips(optimistic);
		this.#emit();
		try {
			const clip = await moveRecordedVoiceover({ sceneId: this.#sceneId, id, start });
			this.#clips = sortVoiceoverClips(
				this.#clips.map((existing) => (existing.id === clip.id ? clip : existing))
			);
			this.#emit();
			return clip;
		} catch (error) {
			this.#clips = previous;
			this.#emit();
			throw error;
		}
	}

	async remove(id: string): Promise<void> {
		++this.#revision;
		await deleteRecordedVoiceover({ sceneId: this.#sceneId, id });
		this.#clips = this.#clips.filter((clip) => clip.id !== id);
		this.#emit();
	}

	async sourceUrl(clip: VoiceoverClip): Promise<string> {
		const data = await readRecordedVoiceover({ sceneId: this.#sceneId, file: clip.file });
		return URL.createObjectURL(base64ToBlob(data, clip.mime));
	}

	#emit() {
		for (const listener of this.#listeners) listener(this.#clips);
	}
}
