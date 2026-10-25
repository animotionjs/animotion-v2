/*
 * Voiceover clips live on one project wide track, in seconds from the start
 * of the presentation, so a clip may begin and end anywhere, including
 * across a scene boundary.
 */
export interface VoiceoverClip {
	id: string;
	label: string;
	file: string;
	start: number;
	duration: number;
	/** Seconds into the recording where the played part begins. */
	trimStart: number;
	/** Length of the whole recording, so a trim can be widened again. */
	sourceDuration: number;
	mime: string;
}

/** The part of a clip an edit can change. The recording length never moves. */
export interface VoiceoverWindow {
	start: number;
	duration: number;
	trimStart: number;
}

export interface VoiceoverTrack {
	version: 1;
	project: string;
	clips: VoiceoverClip[];
}

export interface VoiceoverRecording {
	blob: Blob;
	duration: number;
	mime: string;
}

const PROJECT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const CLIP_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const FILE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;
const MIME_TYPES = new Set(['audio/wav', 'audio/x-wav']);

export function validateProject(slug: string): void {
	if (!PROJECT_PATTERN.test(slug)) throw new RangeError('Voiceover project is invalid');
}

export function validateVoiceoverFile(file: string): void {
	if (!FILE_PATTERN.test(file)) throw new RangeError('Voiceover clip file is invalid');
}

export function validateVoiceoverClip(value: unknown): VoiceoverClip {
	if (typeof value !== 'object' || value === null) {
		throw new RangeError('Voiceover clip must be an object');
	}

	const input = value as Record<string, unknown>;
	if (typeof input.id !== 'string' || !CLIP_ID_PATTERN.test(input.id)) {
		throw new RangeError('Voiceover clip id is invalid');
	}
	if (
		input.label !== undefined &&
		(typeof input.label !== 'string' || input.label.length === 0 || input.label.length > 80)
	) {
		throw new RangeError('Voiceover clip label is invalid');
	}
	if (typeof input.file !== 'string') {
		throw new RangeError('Voiceover clip file is invalid');
	}
	validateVoiceoverFile(input.file);
	if (typeof input.mime !== 'string' || !MIME_TYPES.has(input.mime)) {
		throw new RangeError('Voiceover clip mime type is invalid');
	}
	if (typeof input.start !== 'number' || !Number.isFinite(input.start) || input.start < 0) {
		throw new RangeError('Voiceover start must be a finite nonnegative number');
	}
	if (
		typeof input.duration !== 'number' ||
		!Number.isFinite(input.duration) ||
		input.duration <= 0
	) {
		throw new RangeError('Voiceover duration must be a finite positive number');
	}
	/*
	 * Older tracks stored no trim, so the whole recording is the source and
	 * nothing is skipped. Reading those files keeps the same clip.
	 */
	const sourceDuration = input.sourceDuration === undefined ? input.duration : input.sourceDuration;
	if (
		typeof sourceDuration !== 'number' ||
		!Number.isFinite(sourceDuration) ||
		sourceDuration <= 0
	) {
		throw new RangeError('Voiceover source duration must be a finite positive number');
	}
	const trimStart = input.trimStart === undefined ? 0 : input.trimStart;
	if (typeof trimStart !== 'number' || !Number.isFinite(trimStart) || trimStart < 0) {
		throw new RangeError('Voiceover trim start must be a finite nonnegative number');
	}
	/*
	 * A trim is only valid for a file whose length is known. An inferred source
	 * is the played length, so the window can never sit outside it. A gap or a
	 * window past the stored source is refused.
	 */
	if (input.sourceDuration !== undefined && trimStart + input.duration > sourceDuration + 1e-6) {
		throw new RangeError('Voiceover trim must stay inside the recording');
	}

	return {
		id: input.id,
		label: typeof input.label === 'string' ? input.label : `Recording ${input.id.slice(0, 8)}`,
		file: input.file,
		start: input.start,
		duration: input.duration,
		trimStart,
		sourceDuration,
		mime: input.mime
	};
}

/** The editable part of a clip, used by the editor and the trim maths. */
export function voiceoverWindow(clip: VoiceoverClip): VoiceoverWindow {
	return { start: clip.start, duration: clip.duration, trimStart: clip.trimStart };
}

export function validateVoiceoverTrack(value: unknown): VoiceoverTrack {
	if (typeof value !== 'object' || value === null) {
		throw new RangeError('Voiceover track is invalid');
	}

	const input = value as Record<string, unknown>;
	if (input.version !== 1) throw new RangeError('Voiceover track version is unsupported');
	if (typeof input.project !== 'string') throw new RangeError('Voiceover track project is invalid');
	validateProject(input.project);
	if (!Array.isArray(input.clips)) throw new RangeError('Voiceover track clips are invalid');

	const clips = input.clips.map((clip) => validateVoiceoverClip(clip));
	const ids = new Set<string>();
	for (const clip of clips) {
		if (ids.has(clip.id)) throw new RangeError('Voiceover track contains duplicate ids');
		ids.add(clip.id);
	}
	for (let left = 0; left < clips.length; left++) {
		for (let right = left + 1; right < clips.length; right++) {
			if (voiceoverOverlaps(clips[left], clips[right])) {
				throw new RangeError('Voiceover track contains overlapping recordings');
			}
		}
	}

	return { version: 1, project: input.project, clips };
}

export function sortVoiceoverClips(clips: readonly VoiceoverClip[]): VoiceoverClip[] {
	return [...clips].sort(
		(left, right) => left.start - right.start || left.id.localeCompare(right.id)
	);
}

export function voiceoverEnd(clip: VoiceoverClip): number {
	return clip.start + clip.duration;
}

export function voiceoverOverlaps(
	clip: Pick<VoiceoverClip, 'start' | 'duration'>,
	other: Pick<VoiceoverClip, 'start' | 'duration'>
): boolean {
	const end = clip.start + clip.duration;
	const otherEnd = other.start + other.duration;
	return clip.start < otherEnd - 1e-9 && other.start < end - 1e-9;
}
