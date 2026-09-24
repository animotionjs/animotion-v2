export interface VoiceoverClip {
	id: string;
	sceneId: string;
	label: string;
	file: string;
	start: number;
	duration: number;
	mime: string;
}

export interface VoiceoverManifest {
	version: 1;
	sceneId: string;
	timelineFps: number;
	clips: VoiceoverClip[];
}

export interface VoiceoverRecording {
	blob: Blob;
	duration: number;
	mime: string;
}

const CLIP_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const FILE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;
const MIME_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/x-wav']);

export function validateSceneId(sceneId: string): void {
	if (sceneId.length === 0 || sceneId.length > 128 || sceneId === '.' || sceneId === '..') {
		throw new RangeError('Scene id is invalid');
	}
}

export function validateVoiceoverFile(file: string): void {
	if (!FILE_PATTERN.test(file)) throw new RangeError('Voiceover clip file is invalid');
}

export function validateTimelineFps(timelineFps: number): void {
	if (!Number.isInteger(timelineFps) || timelineFps <= 0) {
		throw new RangeError('Voiceover timeline fps must be a positive integer');
	}
}

export function validateVoiceoverClip(value: unknown): VoiceoverClip {
	if (typeof value !== 'object' || value === null) {
		throw new RangeError('Voiceover clip must be an object');
	}

	const input = value as Record<string, unknown>;
	if (typeof input.id !== 'string' || !CLIP_ID_PATTERN.test(input.id)) {
		throw new RangeError('Voiceover clip id is invalid');
	}
	if (typeof input.sceneId !== 'string') {
		throw new RangeError('Voiceover clip scene id is invalid');
	}
	validateSceneId(input.sceneId);
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

	return {
		id: input.id,
		sceneId: input.sceneId,
		label: typeof input.label === 'string' ? input.label : `Recording ${input.id.slice(0, 8)}`,
		file: input.file,
		start: input.start,
		duration: input.duration,
		mime: input.mime
	};
}

export function validateVoiceoverManifest(value: unknown): VoiceoverManifest {
	if (typeof value !== 'object' || value === null) {
		throw new RangeError('Voiceover manifest is invalid');
	}

	const input = value as Record<string, unknown>;
	if (input.version !== 1) throw new RangeError('Voiceover manifest version is unsupported');
	if (typeof input.sceneId !== 'string')
		throw new RangeError('Voiceover manifest scene id is invalid');
	validateSceneId(input.sceneId);
	if (typeof input.timelineFps !== 'number') {
		throw new RangeError('Voiceover manifest timeline fps is invalid');
	}
	validateTimelineFps(input.timelineFps);
	if (!Array.isArray(input.clips)) throw new RangeError('Voiceover manifest clips are invalid');

	const clips = input.clips.map((clip) => {
		if (typeof clip !== 'object' || clip === null) {
			throw new RangeError('Voiceover manifest clip is invalid');
		}
		return validateVoiceoverClip({
			...(clip as Record<string, unknown>),
			sceneId: input.sceneId
		});
	});
	const ids = new Set<string>();
	for (const clip of clips) {
		if (ids.has(clip.id)) throw new RangeError('Voiceover manifest contains duplicate ids');
		ids.add(clip.id);
	}
	for (let left = 0; left < clips.length; left++) {
		for (let right = left + 1; right < clips.length; right++) {
			if (voiceoverOverlaps(clips[left], clips[right])) {
				throw new RangeError('Voiceover manifest contains overlapping recordings');
			}
		}
	}

	return {
		version: 1,
		sceneId: input.sceneId,
		timelineFps: input.timelineFps,
		clips
	};
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
