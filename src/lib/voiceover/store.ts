import {
	deleteRecordedVoiceover,
	loadVoiceovers,
	pruneRecordedVoiceovers,
	readRecordedVoiceover,
	renameRecordedVoiceover,
	restoreRecordedVoiceover,
	saveRecordedVoiceover,
	setRecordedVoiceoverWindow,
	setRecordedVoiceoverWindows
} from './voiceovers.remote.js';
import {
	sortVoiceoverClips,
	type VoiceoverClip,
	type VoiceoverRecording,
	type VoiceoverWindow
} from './types.js';

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

/*
 * The id also names the audio file, so a short one keeps the folder readable.
 * Eight hex characters are plenty for one project's takes, and collisions are
 * already refused at save time because the id must be unique in the track.
 */
function recordingId(): string {
	if (typeof globalThis.crypto?.getRandomValues === 'function') {
		const bytes = globalThis.crypto.getRandomValues(new Uint8Array(4));
		return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
	}
	return `recording-${Date.now().toString(36)}`;
}

function nextLabel(clips: readonly VoiceoverClip[]): number {
	return clips.reduce((highest, clip) => {
		const match = /^Recording (\d+)$/.exec(clip.label);
		return match ? Math.max(highest, Number(match[1]) + 1) : highest;
	}, 1);
}

/**
 * The project's voiceover track. Clips live in presentation seconds, so the
 * store knows the timeline length only to clamp and to spot overlaps.
 */
export class VoiceoverStore {
	#project: string;
	#clips: VoiceoverClip[] = [];
	#nextLabel = 1;
	#listeners = new Set<VoiceoverStoreListener>();

	constructor(project: string) {
		this.#project = project;
	}

	get project(): string {
		return this.#project;
	}

	get clips(): readonly VoiceoverClip[] {
		return this.#clips;
	}

	subscribe(listener: VoiceoverStoreListener) {
		this.#listeners.add(listener);
		listener(this.#clips);
		return () => this.#listeners.delete(listener);
	}

	async load(project = this.#project): Promise<void> {
		this.#project = project;
		/*
		 * Audio left by a delete that was never undone outlives the session, so
		 * it is swept once on load, before any edit can rely on a file.
		 */
		await pruneRecordedVoiceovers({ project }).catch(() => []);
		const track = await loadVoiceovers({ project });
		this.#clips = sortVoiceoverClips(track.clips);
		this.#nextLabel = nextLabel(this.#clips);
		this.#emit();
	}

	async add(recording: VoiceoverRecording, start: number): Promise<VoiceoverClip> {
		const clip = await saveRecordedVoiceover({
			project: this.#project,
			id: recordingId(),
			label: `Recording ${this.#nextLabel++}`,
			start,
			duration: recording.duration,
			mime: recording.mime,
			data: await blobToBase64(recording.blob)
		});
		this.#clips = sortVoiceoverClips([...this.#clips, clip]);
		this.#emit();
		return clip;
	}

	async setWindow(id: string, window: VoiceoverWindow): Promise<VoiceoverClip> {
		const previous = this.#clips;
		const optimistic = previous.map((clip) => (clip.id === id ? { ...clip, ...window } : clip));
		this.#clips = sortVoiceoverClips(optimistic);
		this.#emit();
		try {
			const clip = await setRecordedVoiceoverWindow({ project: this.#project, id, ...window });
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

	/**
	 * Applies new windows for several clips as one write. The whole batch
	 * lands together, so a group move is never half saved, and one rollback
	 * returns every clip to where it was.
	 */
	async setWindows(
		windows: readonly ({ id: string } & VoiceoverWindow)[]
	): Promise<VoiceoverClip[]> {
		const previous = this.#clips;
		const changes = new Map(windows.map((window) => [window.id, window]));
		const optimistic = previous.map((clip) => {
			const window = changes.get(clip.id);
			return window ? { ...clip, ...window } : clip;
		});
		this.#clips = sortVoiceoverClips(optimistic);
		this.#emit();
		try {
			const updated = await setRecordedVoiceoverWindows({ project: this.#project, windows });
			const byId = new Map(updated.map((clip) => [clip.id, clip]));
			this.#clips = sortVoiceoverClips(
				this.#clips.map((existing) => byId.get(existing.id) ?? existing)
			);
			this.#emit();
			return updated;
		} catch (error) {
			this.#clips = previous;
			this.#emit();
			throw error;
		}
	}

	async rename(id: string, label: string): Promise<VoiceoverClip> {
		const previous = this.#clips;
		/*
		 * The label is patched in place, keeping the array and every other clip
		 * object identical, so only the text rerenders and nothing remounts.
		 */
		this.#clips = previous.map((clip) => (clip.id === id ? { ...clip, label } : clip));
		this.#emit();
		try {
			const clip = await renameRecordedVoiceover({ project: this.#project, id, label });
			this.#clips = this.#clips.map((existing) => (existing.id === clip.id ? clip : existing));
			this.#emit();
			return clip;
		} catch (error) {
			this.#clips = previous;
			this.#emit();
			throw error;
		}
	}

	async remove(id: string): Promise<void> {
		await deleteRecordedVoiceover({ project: this.#project, id });
		this.#clips = this.#clips.filter((clip) => clip.id !== id);
		this.#emit();
	}

	/** Puts a deleted clip back. Its audio stayed on disk, so only the track changes. */
	async restore(clip: VoiceoverClip): Promise<VoiceoverClip> {
		const restored = await restoreRecordedVoiceover({ project: this.#project, clip });
		this.#clips = sortVoiceoverClips([
			...this.#clips.filter((existing) => existing.id !== restored.id),
			restored
		]);
		this.#emit();
		return restored;
	}

	async sourceUrl(clip: VoiceoverClip): Promise<string> {
		const data = await readRecordedVoiceover({ project: this.#project, file: clip.file });
		return URL.createObjectURL(base64ToBlob(data, clip.mime));
	}

	/** The recorded bytes, used for the waveform and the audio element. */
	async source(clip: VoiceoverClip): Promise<Blob> {
		const data = await readRecordedVoiceover({ project: this.#project, file: clip.file });
		return base64ToBlob(data, clip.mime);
	}

	#emit() {
		for (const listener of this.#listeners) listener(this.#clips);
	}
}
