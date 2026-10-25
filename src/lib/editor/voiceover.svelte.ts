import { SvelteMap } from 'svelte/reactivity';
import { AudioController } from '../scene/audio/controller.js';
import { VoiceoverRecorder } from '../voiceover/recorder.js';
import { VoiceoverStore } from '../voiceover/store.js';
import { voiceoverTracks } from '../voiceover/tracks.js';
import {
	DEFAULT_VOICEOVER_FILTERS,
	cloneVoiceoverFilters,
	type VoiceoverFilterSettings
} from '../voiceover/filters.js';
import {
	loadVoiceoverFilters,
	saveVoiceoverFilterSettings
} from '../voiceover/voiceovers.remote.js';
import { loadPeaks, livePeaks, peaksOf, prunePeaks, seedPeaks, slicePeaks } from './waveform.js';
import type { WaveformPeaks } from './waveform.js';
import { voiceoverOverlaps, voiceoverWindow } from '../voiceover/types.js';
import type { VoiceoverClip, VoiceoverRecording, VoiceoverWindow } from '../voiceover/types.js';
import type { VoiceoverTrimLimits } from './trim.js';
import type { EditorController } from './controller.svelte.js';

/**
 * One reversible edit. Only the track changes, so a step is a clip whose
 * window moved or trimmed, or a clip that was renamed, holding both the value
 * before the edit and the value after it. Undo applies `before`, redo
 * applies `after`.
 */
type VoiceoverEdit =
	| { kind: 'window'; id: string; before: VoiceoverWindow; after: VoiceoverWindow }
	| {
			kind: 'windowGroup';
			steps: { id: string; before: VoiceoverWindow; after: VoiceoverWindow }[];
	  }
	| { kind: 'rename'; id: string; before: string; after: string }
	| { kind: 'delete'; clips: VoiceoverClip[] };

/** How many edits can be taken back. Enough for a session, cheap to hold. */
const HISTORY_LIMIT = 50;

/**
 * The voiceover track while the editor is open. It owns the recordings, the
 * microphone, and the audio controller, so the timeline and the transport only
 * have to read state and call these methods.
 *
 * Clips live in presentation seconds, so nothing here knows about scenes.
 */
export class EditorVoiceover {
	readonly controller: EditorController;

	#store: VoiceoverStore;
	#recorder: VoiceoverRecorder;
	#audio = new AudioController();
	#clips = $state<VoiceoverClip[]>([]);
	#sources = new SvelteMap<string, Blob>();
	#urls = new SvelteMap<string, string>();
	/*
	 * The selected clips in track order. Most edits work on one clip, but a
	 * move or a delete can act on the whole set, so the id list is the source
	 * of truth and the last one remembers the clip a rename or a click lands on.
	 */
	#selectedIds = $state<string[]>([]);
	#message = $state<string | null>(null);
	#recording = $state(false);
	#saving = $state(false);
	#elapsed = $state(0);
	/*
	 * Rebuilt from the recorder's samples on the recording timer, so the lane
	 * can draw the take as it grows without reading audio state in render.
	 */
	#livePeaks = $state<WaveformPeaks>([]);
	#recordStart = 0;
	/*
	 * The wall clock at the start of a take. The playback clock is frozen while
	 * recording, so it cannot say how long the take is running, and only real
	 * time can drive the live display.
	 */
	#recordStartedAt = 0;
	#timer: number | null = null;
	#unsubscribe: () => void;
	#destroyed = false;
	#started = false;
	#filters = $state<VoiceoverFilterSettings>(cloneVoiceoverFilters(DEFAULT_VOICEOVER_FILTERS));
	#saveTimer: number | null = null;
	/*
	 * Undo steps for the edits that only change the track, never a file. A step
	 * remembers one clip and the value it held before, so replaying it goes
	 * through the same move or rename path as the original edit.
	 */
	#undo: VoiceoverEdit[] = $state([]);
	#redo: VoiceoverEdit[] = $state([]);
	/*
	 * True while an undo or redo is replaying an edit. The replay goes through
	 * the same methods as a user action, so it must not record itself as a new
	 * edit or the history would grow on every undo.
	 */
	#restoring = false;

	constructor(controller: EditorController, project: string) {
		this.controller = controller;
		this.#store = new VoiceoverStore(project);
		this.#recorder = new VoiceoverRecorder();
		this.#unsubscribe = this.#store.subscribe((clips) => {
			prunePeaks(clips);
			this.#clips = [...clips];
			void this.#hydrate(clips);
		});
	}

	/**
	 * Reads the track once the build is mounted, never during a server render.
	 * The track load is returned so a caller that needs the clips in hand can
	 * wait for them, while the filters keep loading in the background.
	 */
	start(): Promise<void> {
		if (this.#started) return Promise.resolve();
		this.#started = true;
		void this.#loadFilters();
		return this.#store.load();
	}

	get clips(): readonly VoiceoverClip[] {
		return this.#clips;
	}

	get filters(): VoiceoverFilterSettings {
		return this.#filters;
	}

	/* Filters apply at capture, so they stay fixed while a take runs */
	get canEditFilters(): boolean {
		return !this.#recording && !this.#saving;
	}

	/** The last clip a click or a focus landed on, the target for a rename. */
	get selectedId(): string | null {
		return this.#selectedIds.at(-1) ?? null;
	}

	/** Every selected clip, in track order. */
	get selection(): readonly VoiceoverClip[] {
		return this.#clips.filter((clip) => this.#selectedIds.includes(clip.id));
	}

	isSelected(id: string): boolean {
		return this.#selectedIds.includes(id);
	}

	get message(): string | null {
		return this.#message;
	}

	get recording(): boolean {
		return this.#recording;
	}

	get saving(): boolean {
		return this.#saving;
	}

	/** Seconds recorded so far, measured from the wall clock while it runs. */
	get elapsed(): number {
		return this.#elapsed;
	}

	/**
	 * The take being captured, drawn like a clip so the lane shows it growing.
	 * It sits where the saved clip will land, so nothing jumps when it stops.
	 * Only the id and the shape matter to the lane, which is why no file is set.
	 */
	get liveClip(): { id: string; label: string; start: number; duration: number } | null {
		if (!this.#recording || this.#elapsed <= 0) return null;
		return {
			id: 'live-recording',
			label: 'recording',
			start: this.#recordStart,
			duration: this.#elapsed
		};
	}

	/** Bars for the take being captured, refreshed on the recording timer. */
	get liveWaveform(): WaveformPeaks {
		return this.#livePeaks;
	}

	/** Reads the unlocked audio context, and follows the clock afterwards. */
	unlock() {
		void this.#audio.unlock().then(() => this.sync());
	}

	get canRecord(): boolean {
		return !this.#saving && this.controller.total > 0;
	}

	/** The clip a single-clip action refers to, or null when none is selected. */
	get selected(): VoiceoverClip | null {
		const id = this.selectedId;
		return this.#clips.find((clip) => clip.id === id) ?? null;
	}

	peaks(clip: VoiceoverClip): WaveformPeaks | null {
		const peaks = peaksOf(clip);
		return peaks ? slicePeaks(peaks, clip) : null;
	}

	/** Replaces the selection with one clip, or clears it with null. */
	select(id: string | null) {
		this.#selectedIds = id === null ? [] : [id];
	}

	/** Keeps exactly one clip selected, used when a drag grabs a clip. */
	focus(clip: VoiceoverClip) {
		this.#selectedIds = [clip.id];
	}

	/** Adds a clip to the selection, or removes it when it is already there. */
	toggle(id: string) {
		this.#selectedIds = this.#selectedIds.includes(id)
			? this.#selectedIds.filter((item) => item !== id)
			: [...this.#selectedIds, id];
	}

	/**
	 * Selects every clip between the anchor and `id`, in track order. The
	 * anchor is the clip a range starts from, so a later shift click can widen
	 * or shrink the range without losing its other end.
	 */
	selectRange(anchorId: string, id: string) {
		const order = this.#clips.map((clip) => clip.id);
		const from = order.indexOf(anchorId);
		const to = order.indexOf(id);
		if (from === -1 || to === -1) {
			this.select(id);
			return;
		}
		const low = Math.min(from, to);
		const high = Math.max(from, to);
		this.#selectedIds = order.slice(low, high + 1);
	}

	/** Moves or trims the clip under the finger while it is dragged. */
	preview(id: string, next: VoiceoverWindow) {
		this.#clips = this.#clips.map((clip) => (clip.id === id ? { ...clip, ...next } : clip));
	}

	/**
	 * Saves a new window, putting the clip back when it would overlap.
	 *
	 * The comparison is against the saved track, never against the live clips,
	 * because a drag previews its window as it moves. Comparing against the
	 * preview would always look unchanged and the edit would never be saved.
	 */
	async commit(id: string, next: VoiceoverWindow) {
		const saved = this.#store.clips.find((item) => item.id === id);
		const clip = this.#clips.find((item) => item.id === id);
		if (!saved || !clip) return;
		if (
			saved.start === next.start &&
			saved.duration === next.duration &&
			saved.trimStart === next.trimStart
		) {
			// the store already holds this window, so only the preview is reset
			this.preview(id, next);
			return;
		}
		this.#message = null;
		if (this.#overlapsNext(id, next.start, next.start + next.duration)) {
			this.#message = 'Recordings cannot overlap.';
			this.#clips = [...this.#store.clips];
			return;
		}
		this.preview(id, next);
		try {
			await this.#store.setWindow(id, next);
			this.#remember({
				kind: 'window',
				id,
				before: voiceoverWindow(saved),
				after: { ...next }
			});
		} catch (error) {
			this.#message = error instanceof Error ? error.message : 'The recording could not be moved.';
			this.#clips = [...this.#store.clips];
		}
	}

	/** Previews new windows for several clips at once, used by a group drag. */
	previewMany(windows: readonly ({ id: string } & VoiceoverWindow)[]) {
		this.#clips = this.#clips.map((clip) => {
			const next = windows.find((window) => window.id === clip.id);
			return next ? { ...clip, ...next } : clip;
		});
	}

	/**
	 * Saves a new window for several clips as one edit. The store writes the
	 * whole batch at once, so the track never holds half of a group move, and
	 * one history step takes the whole move back.
	 */
	async commitMany(windows: readonly ({ id: string } & VoiceoverWindow)[]) {
		const steps: { id: string; before: VoiceoverWindow; after: VoiceoverWindow }[] = [];
		for (const after of windows) {
			const before = this.#store.clips.find((clip) => clip.id === after.id);
			if (!before) continue;
			if (
				before.start === after.start &&
				before.duration === after.duration &&
				before.trimStart === after.trimStart
			) {
				continue;
			}
			steps.push({
				id: after.id,
				before: voiceoverWindow(before),
				after: { start: after.start, duration: after.duration, trimStart: after.trimStart }
			});
		}
		if (steps.length === 0) return;
		this.#message = null;
		for (const step of steps) {
			if (this.#overlapsNext(step.id, step.after.start, step.after.start + step.after.duration)) {
				this.#message = 'Recordings cannot overlap.';
				this.#clips = [...this.#store.clips];
				return;
			}
		}
		this.previewMany(windows);
		try {
			await this.#store.setWindows(steps.map((step) => ({ id: step.id, ...step.after })));
			this.#remember({ kind: 'windowGroup', steps });
		} catch (error) {
			this.#message = error instanceof Error ? error.message : 'The recordings could not be moved.';
			this.#clips = [...this.#store.clips];
		}
	}

	/**
	 * How far a clip's edges may move before they hit a neighbour or the end
	 * of the recording. Read from the saved track, so a drag that previews
	 * its own window never feeds back into its own limits.
	 */
	trimLimits(id: string): VoiceoverTrimLimits {
		const clip = this.#store.clips.find((item) => item.id === id);
		if (!clip) {
			return {
				minStart: 0,
				maxEnd: Number.POSITIVE_INFINITY,
				sourceDuration: Number.POSITIVE_INFINITY,
				minDuration: this.controller.frameDuration
			};
		}
		let minStart = 0;
		let maxEnd = Number.POSITIVE_INFINITY;
		for (const other of this.#store.clips) {
			if (other.id === id) continue;
			const end = other.start + other.duration;
			if (end <= clip.start + 1e-9) minStart = Math.max(minStart, end);
			if (other.start >= clip.start + clip.duration - 1e-9) {
				maxEnd = Math.min(maxEnd, other.start);
			}
		}
		return {
			minStart,
			maxEnd,
			sourceDuration: clip.sourceDuration,
			minDuration: this.controller.frameDuration
		};
	}

	/**
	 * Renames a clip. The label is the only thing that changes, and the track
	 * rejects an empty one because a nameless clip is hard to pick out.
	 */
	async rename(id: string, label: string) {
		const trimmed = label.trim();
		if (trimmed.length === 0) {
			this.#message = 'A recording needs a name.';
			return;
		}
		const clip = this.#clips.find((item) => item.id === id);
		if (!clip || clip.label === trimmed) return;
		this.#message = null;
		try {
			await this.#store.rename(id, trimmed);
			this.#remember({ kind: 'rename', id, before: clip.label, after: trimmed });
		} catch (error) {
			this.#message =
				error instanceof Error ? error.message : 'The recording could not be renamed.';
			this.#clips = [...this.#store.clips];
		}
	}

	/** Removes one clip. */
	async remove(id: string) {
		const clip = this.#clips.find((item) => item.id === id);
		if (clip) await this.removeMany([id]);
	}

	/**
	 * Removes every named clip as one edit. The audio stays on disk, so the
	 * whole delete can be taken back with a single undo.
	 */
	async removeMany(ids: readonly string[]) {
		this.#message = null;
		const clips = this.#clips.filter((clip) => ids.includes(clip.id));
		if (clips.length === 0) return;
		try {
			for (const clip of clips) await this.#store.remove(clip.id);
			for (const clip of clips) this.#dropLocal(clip);
			this.#remember({ kind: 'delete', clips });
			this.#relink();
		} catch (error) {
			this.#message =
				error instanceof Error ? error.message : 'The recording could not be deleted.';
		}
	}

	/** Drops the cached audio and the selection for a clip that left the track. */
	#dropLocal(clip: VoiceoverClip) {
		this.#selectedIds = this.#selectedIds.filter((id) => id !== clip.id);
		this.#sources.delete(clip.id);
		const url = this.#urls.get(clip.id);
		if (url) {
			URL.revokeObjectURL(url);
			this.#urls.delete(clip.id);
		}
	}

	get canUndo(): boolean {
		return this.#undo.length > 0;
	}

	get canRedo(): boolean {
		return this.#redo.length > 0;
	}

	/** Takes back the last move or rename, and offers it to redo. */
	async undo() {
		const edit = this.#undo.at(-1);
		if (!edit) return;
		// a replay that does not land leaves the step in place, so it can be retried
		if (!(await this.#apply(edit, 'before'))) return;
		this.#undo.pop();
		this.#redo.push(edit);
	}

	/** Puts back the last edit that was taken back. */
	async redo() {
		const edit = this.#redo.at(-1);
		if (!edit) return;
		if (!(await this.#apply(edit, 'after'))) return;
		this.#redo.pop();
		this.#undo.push(edit);
	}

	/**
	 * Replays one end of an edit through the same path the edit itself used, so
	 * a restored value is validated exactly like a new one and can never write
	 * something the store would reject.
	 */
	async #apply(edit: VoiceoverEdit, end: 'before' | 'after'): Promise<boolean> {
		this.#restoring = true;
		try {
			if (edit.kind === 'delete') {
				if (end === 'before') {
					// undo puts the clips back, their audio never left the disk
					for (const clip of edit.clips) {
						await this.#store.restore(clip);
						await this.#hydrate([clip]);
					}
					this.#selectedIds = edit.clips.map((clip) => clip.id);
					this.#relink();
					return edit.clips.every((clip) => this.#clips.some((item) => item.id === clip.id));
				}
				for (const clip of edit.clips) {
					await this.#store.remove(clip.id);
					this.#dropLocal(clip);
				}
				this.#relink();
				return edit.clips.every((clip) => !this.#clips.some((item) => item.id === clip.id));
			}
			if (edit.kind === 'windowGroup') {
				const windows = edit.steps.map((step) => ({
					id: step.id,
					...(end === 'before' ? step.before : step.after)
				}));
				await this.commitMany(windows);
				return windows.every((window) => {
					const clip = this.#clips.find((item) => item.id === window.id);
					return (
						clip !== undefined &&
						Math.abs(clip.start - window.start) < 1e-6 &&
						Math.abs(clip.duration - window.duration) < 1e-6 &&
						Math.abs(clip.trimStart - window.trimStart) < 1e-6
					);
				});
			}
			if (edit.kind === 'window') {
				const next = end === 'before' ? edit.before : edit.after;
				await this.commit(edit.id, next);
				const clip = this.#clips.find((item) => item.id === edit.id);
				return (
					clip !== undefined &&
					Math.abs(clip.start - next.start) < 1e-6 &&
					Math.abs(clip.duration - next.duration) < 1e-6 &&
					Math.abs(clip.trimStart - next.trimStart) < 1e-6
				);
			}
			const label = end === 'before' ? edit.before : edit.after;
			await this.rename(edit.id, label);
			const clip = this.#clips.find((item) => item.id === edit.id);
			return clip !== undefined && clip.label === label;
		} catch {
			// a replay that throws has not landed, and it must not reach the caller
			return false;
		} finally {
			this.#restoring = false;
		}
	}

	/**
	 * Records an edit and clears the redo stack, because a fresh edit makes the
	 * edits that were taken back unreachable, as every editor does.
	 */
	#remember(edit: VoiceoverEdit) {
		if (this.#restoring) return;
		this.#undo.push(edit);
		if (this.#undo.length > HISTORY_LIMIT) this.#undo.shift();
		this.#redo = [];
	}

	/** Starts or stops a recording, keeping the clock frozen while it runs. */
	async toggleRecord() {
		if (this.#recording) {
			await this.stopRecording();
			return;
		}
		await this.startRecording();
	}

	async startRecording() {
		if (this.#recording || this.#saving) return;
		this.#message = null;
		const total = this.controller.total;
		if (total <= 0) {
			this.#message = 'Wait for the timeline to finish measuring.';
			return;
		}
		if (this.controller.time >= total - 1e-6) {
			this.#message = 'Move the playhead before the end of the presentation.';
			return;
		}
		if (this.#clips.some((clip) => this.#covers(clip, this.controller.time))) {
			this.#message = 'Move the playhead to an empty part of the track.';
			return;
		}

		this.#recordStart = this.controller.time;
		this.controller.lock(true);
		// the microphone would otherwise record whatever the preview plays
		this.#audio.stop();
		try {
			await this.#recorder.start(cloneVoiceoverFilters(this.#filters));
		} catch (error) {
			this.controller.lock(false);
			this.#message =
				error instanceof Error ? error.message : 'The microphone could not be started.';
			return;
		}
		this.#recording = true;
		this.#elapsed = 0;
		this.#livePeaks = [];
		this.#recordStartedAt = performance.now();
		this.#timer = window.setInterval(() => {
			this.#elapsed = Math.max(0, (performance.now() - this.#recordStartedAt) / 1000);
			// the samples live outside Svelte, so the timer is what publishes them
			this.#livePeaks = livePeaks(this.#recorder.channels);
		}, 100);
	}

	async stopRecording() {
		const start = this.#recordStart;
		if (!this.#recording) return;
		this.#recording = false;
		this.#livePeaks = [];
		this.#stopTimer();
		this.#saving = true;
		/*
		 * The recorder stops exactly when the stop is asked for, so its own
		 * duration is the truth. A recording that ran into the next clip is
		 * kept only up to that clip, which needs no re-encode.
		 */
		const limit = this.#nextClipStart(start);
		try {
			/*
			 * The samples are in hand right now, so the waveform for the saved
			 * clip is built from them. Reading the file back would leave the
			 * lane blank for a moment, which reads as a flicker.
			 */
			const captured = livePeaks(this.#recorder.channels);
			const result: VoiceoverRecording = await this.#recorder.stop();
			if (result.duration <= 0) throw new Error('The recording was empty.');
			const room = limit === null ? Infinity : limit - start;
			const duration = Math.max(0, Math.min(result.duration, room));
			if (duration <= 0) throw new Error('The recording had no room before the next clip.');
			const clip = await this.#store.add({ ...result, duration }, start);
			seedPeaks(clip.id, captured);
			this.focus(clip);
			this.controller.seek(clip.start);
		} catch (error) {
			this.#message = error instanceof Error ? error.message : 'The recording could not be saved.';
		} finally {
			this.#saving = false;
			this.controller.lock(false);
		}
	}

	/** Where the clip after `start` begins, when one sits ahead of the playhead. */
	#nextClipStart(start: number): number | null {
		let nearest: number | null = null;
		for (const clip of this.#clips) {
			if (clip.start <= start + 1e-9) continue;
			if (nearest === null || clip.start < nearest) nearest = clip.start;
		}
		return nearest;
	}

	/** Stops a recording that has grown into the next clip. */
	sync() {
		if (this.#destroyed) return;
		if (this.#recording && this.#overlapsNext(null, this.#recordStart, this.controller.time)) {
			void this.stopRecording();
			return;
		}
		const total = this.controller.total;
		if (total <= 0) return;
		const playing = this.controller.playing && !this.controller.locked && this.controller.voiceover;
		this.#audio.sync(this.controller.time, playing);
	}

	/**
	 * True when a recording from `start` to `end` would run into another clip.
	 * The clip being moved is skipped, since it would otherwise always collide
	 * with the position it was just dragged to.
	 */
	#overlapsNext(movingId: string | null, start: number, end: number) {
		return this.#clips.some(
			(clip) => clip.id !== movingId && voiceoverOverlaps({ start, duration: end - start }, clip)
		);
	}

	/** The track's length changed, for example once every scene is measured. */
	relink() {
		this.#relink();
	}

	/* Replaces the whole chain, used by the input panel and the reset */
	updateFilters(next: VoiceoverFilterSettings) {
		if (this.#recording || this.#saving) return;
		this.#filters = cloneVoiceoverFilters(next);
		this.#scheduleFilterSave();
	}

	/* Restores the OBS based defaults */
	resetFilters() {
		this.updateFilters(DEFAULT_VOICEOVER_FILTERS);
	}

	destroy() {
		this.#destroyed = true;
		this.#unsubscribe();
		this.#audio.destroy();
		this.#recorder.destroy();
		this.#stopTimer();
		/*
		 * A pending filter write is flushed rather than dropped, so the last
		 * slider move of a session still reaches the file. It cannot be awaited
		 * here, so the write runs on its own.
		 */
		if (this.#saveTimer !== null) {
			clearTimeout(this.#saveTimer);
			this.#saveTimer = null;
			this.#writeFilters();
		}
		this.#sources.clear();
		for (const url of this.#urls.values()) URL.revokeObjectURL(url);
		this.#urls.clear();
	}

	#covers(clip: VoiceoverClip, seconds: number) {
		return seconds >= clip.start - 1e-9 && seconds < clip.start + clip.duration - 1e-9;
	}

	#stopTimer() {
		if (this.#timer === null) return;
		clearInterval(this.#timer);
		this.#timer = null;
	}

	/** Reads each recording once, because the mixer and the wave need it. */
	async #hydrate(clips: readonly VoiceoverClip[]) {
		let added = false;
		for (const clip of clips) {
			if (this.#sources.has(clip.id)) continue;
			added = true;
			const blob = await this.#store.source(clip).catch(() => null);
			if (blob === null) continue;
			this.#sources.set(clip.id, blob);
			this.#urls.set(clip.id, URL.createObjectURL(blob));
			void loadPeaks(clip, blob);
		}
		if (added) this.#relink();
	}

	#relink() {
		const total = this.controller.total;
		if (total <= 0) return;
		this.#audio.load(voiceoverTracks(this.#clips, this.#urls), total);
	}

	async #loadFilters() {
		try {
			const file = await loadVoiceoverFilters({ project: this.#store.project });
			if (this.#destroyed) return;
			this.#filters = cloneVoiceoverFilters(file.filters);
		} catch {
			// defaults stay in place when the file is missing or broken
		}
	}

	/* Slider drags write the file only after a pause, not per pixel */
	#scheduleFilterSave() {
		if (this.#saveTimer !== null) clearTimeout(this.#saveTimer);
		this.#saveTimer = window.setTimeout(() => {
			this.#saveTimer = null;
			this.#writeFilters();
		}, 400);
	}

	#writeFilters() {
		void saveVoiceoverFilterSettings({
			project: this.#store.project,
			filters: cloneVoiceoverFilters(this.#filters)
		}).catch(() => {
			// the chain already runs in memory, a failed write retries on next edit
		});
	}
}
