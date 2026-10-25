import { randomBytes, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
	sortVoiceoverClips,
	validateProject,
	validateVoiceoverClip,
	validateVoiceoverFile,
	validateVoiceoverTrack,
	voiceoverOverlaps,
	type VoiceoverClip,
	type VoiceoverTrack
} from '../voiceover/types.ts';
import {
	DEFAULT_VOICEOVER_FILTERS,
	cloneVoiceoverFilters,
	validateVoiceoverFilterFile,
	type VoiceoverFilterFile,
	type VoiceoverFilterSettings
} from '../voiceover/filters.ts';

const MAX_RECORDING_BYTES = 100 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
	'audio/wav': 'wav',
	'audio/x-wav': 'wav'
};

/*
 * The fallback id for a recording that arrives without one. It names the audio
 * file too, so it stays short, and the id only has to be unique in one track.
 */
function shortId(): string {
	return randomBytes(4).toString('hex');
}

let mutationQueue: Promise<void> = Promise.resolve();

export function flushVoiceoverWrites(): Promise<void> {
	return mutationQueue;
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
	const result = mutationQueue.then(operation, operation);
	mutationQueue = result.then(
		() => undefined,
		() => undefined
	);
	return result;
}

/* Recordings belong to the presentation, so they are stored with the scenes. */
function rootDirectory(): string {
	return resolve(process.cwd(), 'src', 'projects');
}

function projectDirectory(project: string): string {
	validateProject(project);
	return join(rootDirectory(), project, 'voiceover');
}

function trackPath(project: string): string {
	return join(projectDirectory(project), 'track.json');
}

function filterPath(project: string): string {
	return join(projectDirectory(project), 'filters.json');
}

function assertClipFile(project: string, file: string): string {
	validateVoiceoverFile(file);
	const directory = projectDirectory(project);
	const path = resolve(directory, file);
	const relativePath = relative(directory, path);
	if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
		throw new RangeError('Voiceover file is outside the project directory');
	}
	return path;
}

async function assertClipExists(project: string, file: string): Promise<void> {
	try {
		await access(assertClipFile(project, file));
	} catch {
		throw new Error(`Voiceover recording is missing: ${file}`);
	}
}

function extensionForMime(mime: string): string {
	const extension = EXTENSIONS[mime];
	if (!extension) throw new RangeError(`Unsupported voiceover mime type: ${mime}`);
	return extension;
}

async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
	const temporary = `${path}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, data);
		await rename(temporary, path);
	} catch (error) {
		await rm(temporary, { force: true });
		throw error;
	}
}

async function writeTrack(track: VoiceoverTrack): Promise<void> {
	await mkdir(projectDirectory(track.project), { recursive: true });
	await writeFileAtomic(trackPath(track.project), `${JSON.stringify(track, null, 2)}\n`);
}

/** The clip that a candidate would collide with, if there is one. */
function overlappingClip(
	clips: readonly VoiceoverClip[],
	candidate: VoiceoverClip
): VoiceoverClip | null {
	for (const clip of clips) {
		if (clip.id !== candidate.id && voiceoverOverlaps(clip, candidate)) return clip;
	}
	return null;
}

/** Absolute path of one recorded file, used by the renderer to read the audio. */
export function voiceoverFilePath(project: string, file: string): string {
	return assertClipFile(project, file);
}

export async function readVoiceoverTrack(project: string): Promise<VoiceoverTrack> {
	validateProject(project);
	try {
		const contents = await readFile(trackPath(project), 'utf8');
		const track = validateVoiceoverTrack(JSON.parse(contents));
		if (track.project !== project) {
			throw new Error(`Voiceover track project does not match ${project}`);
		}
		await Promise.all(track.clips.map((clip) => assertClipExists(project, clip.file)));
		return track;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return { version: 1, project, clips: [] };
		}
		throw error;
	}
}

export async function saveVoiceover(input: {
	project: string;
	id?: string;
	start: number;
	duration: number;
	mime: string;
	label?: string;
	data: string;
}): Promise<VoiceoverClip> {
	return enqueue(async () => {
		const track = await readVoiceoverTrack(input.project);
		const id = input.id ?? shortId();
		const file = `${id}.${extensionForMime(input.mime)}`;
		const data = Buffer.from(input.data, 'base64');
		if (data.byteLength === 0 || data.byteLength > MAX_RECORDING_BYTES) {
			throw new Error('The recording is empty or too large.');
		}

		// a fresh recording plays in full, so its source is its whole length
		const clip = validateVoiceoverClip({
			id,
			label: input.label,
			file,
			start: input.start,
			duration: input.duration,
			trimStart: 0,
			sourceDuration: input.duration,
			mime: input.mime
		});
		/*
		 * A plain error survives the remote boundary with its message intact.
		 * A RangeError arrives as an internal error and the reason is lost.
		 */
		if (overlappingClip(track.clips, clip)) {
			throw new Error('The recording overlaps another one.');
		}

		const directory = projectDirectory(input.project);
		await mkdir(directory, { recursive: true });
		const audioPath = assertClipFile(input.project, file);
		await writeFileAtomic(audioPath, data);
		try {
			const clips = sortVoiceoverClips([
				...track.clips.filter((existing) => existing.id !== id),
				clip
			]);
			await writeTrack({ ...track, clips });
		} catch (error) {
			await rm(audioPath, { force: true });
			throw error;
		}
		return clip;
	});
}

/**
 * Moves or trims one clip by writing its window. The recording length is kept,
 * so a trim can always be widened back and the audio file never changes.
 */
export async function setVoiceoverWindow(input: {
	project: string;
	id: string;
	start: number;
	trimStart: number;
	duration: number;
}): Promise<VoiceoverClip> {
	const [updated] = await setVoiceoverWindows({
		project: input.project,
		windows: [
			{
				id: input.id,
				start: input.start,
				trimStart: input.trimStart,
				duration: input.duration
			}
		]
	});
	if (!updated) throw new Error('Voiceover recording was not found');
	return updated;
}

/**
 * Writes new windows for several clips in one queued track write, so a group
 * move lands together and can never leave the track half moved. Overlap is
 * checked against the final set, which is what a group move must respect.
 */
export async function setVoiceoverWindows(input: {
	project: string;
	windows: readonly { id: string; start: number; trimStart: number; duration: number }[];
}): Promise<VoiceoverClip[]> {
	return enqueue(async () => {
		const track = await readVoiceoverTrack(input.project);
		const updated: VoiceoverClip[] = [];

		for (const window of input.windows) {
			const existing = track.clips.find((clip) => clip.id === window.id);
			if (!existing) throw new Error('Voiceover recording was not found');
			updated.push(
				validateVoiceoverClip({
					...existing,
					start: window.start,
					trimStart: window.trimStart,
					duration: window.duration
				})
			);
		}

		/*
		 * Every window is validated before anything is written, and the final
		 * set is checked for overlap, so a group move that would collide is
		 * refused whole rather than leaving the track half moved.
		 */
		const byId = new Map(updated.map((clip) => [clip.id, clip]));
		const next = track.clips.map((clip) => byId.get(clip.id) ?? clip);
		for (const clip of next) {
			if (overlappingClip(next, clip)) {
				throw new Error('The recording overlaps another one.');
			}
		}

		const clips = sortVoiceoverClips(next);
		await writeTrack({ ...track, clips });
		return updated;
	});
}

export async function renameVoiceover(input: {
	project: string;
	id: string;
	label: string;
}): Promise<VoiceoverClip> {
	return enqueue(async () => {
		const track = await readVoiceoverTrack(input.project);
		const existing = track.clips.find((clip) => clip.id === input.id);
		if (!existing) throw new Error('Voiceover recording was not found');

		// only the label changes, the file on disk keeps its name
		const renamed = validateVoiceoverClip({ ...existing, label: input.label });
		const clips = sortVoiceoverClips(
			track.clips.map((clip) => (clip.id === renamed.id ? renamed : clip))
		);
		await writeTrack({ ...track, clips });
		return renamed;
	});
}

/**
 * Takes a clip out of the track but leaves its audio on disk, so the delete can
 * be undone. The file is removed by `pruneVoiceovers` once the delete can no
 * longer be taken back.
 */
export async function deleteVoiceover(input: {
	project: string;
	id: string;
}): Promise<VoiceoverClip | null> {
	return enqueue(async () => {
		const track = await readVoiceoverTrack(input.project);
		const existing = track.clips.find((clip) => clip.id === input.id);
		if (!existing) return null;

		await writeTrack({
			...track,
			clips: track.clips.filter((clip) => clip.id !== input.id)
		});
		return existing;
	});
}

/**
 * Puts a clip back after an undo. The audio was never removed, so only the
 * track entry is written. It refuses if the file has since gone, which would
 * leave a clip pointing at nothing.
 */
export async function restoreVoiceover(input: {
	project: string;
	clip: VoiceoverClip;
}): Promise<VoiceoverClip> {
	return enqueue(async () => {
		const track = await readVoiceoverTrack(input.project);
		const clip = validateVoiceoverClip(input.clip);
		if (overlappingClip(track.clips, clip)) {
			throw new Error('The recording overlaps another one.');
		}
		await assertClipExists(input.project, clip.file);

		const clips = sortVoiceoverClips([...track.clips.filter((item) => item.id !== clip.id), clip]);
		await writeTrack({ ...track, clips });
		return clip;
	});
}

/**
 * Removes any audio in the project folder that the track no longer lists. A
 * delete leaves its file behind so the edit can be undone, and a delete that
 * was never undone outlives the session that made it. The editor prunes on
 * load, when no write is in flight, so a file is only removed once it is
 * certain nothing references it.
 */
export async function pruneVoiceovers(input: { project: string }): Promise<string[]> {
	return enqueue(async () => {
		const track = await readVoiceoverTrack(input.project);
		const listed = new Set(track.clips.map((clip) => clip.file));
		let entries: string[];
		try {
			entries = await readdir(projectDirectory(input.project));
		} catch {
			return [];
		}

		const removed: string[] = [];
		for (const entry of entries) {
			if (!entry.endsWith('.wav') || listed.has(entry)) continue;
			await rm(assertClipFile(input.project, entry), { force: true });
			removed.push(entry);
		}
		return removed;
	});
}

export async function readVoiceoverFile(project: string, file: string): Promise<Buffer> {
	const track = await readVoiceoverTrack(project);
	if (!track.clips.some((clip) => clip.file === file)) {
		throw new Error('Voiceover recording is not listed in the track');
	}
	return readFile(assertClipFile(project, file));
}

/* Filter chain for the project input. Missing files fall back to defaults. */
export async function readVoiceoverFilters(project: string): Promise<VoiceoverFilterFile> {
	validateProject(project);
	try {
		const contents = await readFile(filterPath(project), 'utf8');
		const file = validateVoiceoverFilterFile(JSON.parse(contents));
		if (file.project !== project) {
			throw new Error(`Voiceover filter project does not match ${project}`);
		}
		return file;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return { version: 1, project, filters: cloneVoiceoverFilters(DEFAULT_VOICEOVER_FILTERS) };
		}
		throw error;
	}
}

export async function saveVoiceoverFilters(input: {
	project: string;
	filters: VoiceoverFilterSettings;
}): Promise<VoiceoverFilterFile> {
	return enqueue(async () => {
		validateProject(input.project);
		const file: VoiceoverFilterFile = {
			version: 1,
			project: input.project,
			filters: { ...input.filters }
		};
		const checked = validateVoiceoverFilterFile(file);
		await mkdir(projectDirectory(input.project), { recursive: true });
		await writeFileAtomic(filterPath(input.project), `${JSON.stringify(checked, null, 2)}\n`);
		return checked;
	});
}
