import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
	sortVoiceoverClips,
	validateSceneId,
	validateTimelineFps,
	validateVoiceoverClip,
	validateVoiceoverFile,
	validateVoiceoverManifest,
	voiceoverOverlaps,
	type VoiceoverClip,
	type VoiceoverManifest
} from '../voiceover/types.ts';

const MAX_RECORDING_BYTES = 100 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
	'audio/webm': 'webm',
	'audio/ogg': 'ogg',
	'audio/mp4': 'm4a',
	'audio/wav': 'wav',
	'audio/x-wav': 'wav'
};

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

function rootDirectory(): string {
	return resolve(process.cwd(), '.animotion', 'voiceovers');
}

function sceneDirectory(sceneId: string): string {
	validateSceneId(sceneId);
	return join(rootDirectory(), encodeURIComponent(sceneId));
}

function manifestPath(sceneId: string): string {
	return join(sceneDirectory(sceneId), 'manifest.json');
}

function assertClipFile(sceneId: string, file: string): string {
	validateVoiceoverFile(file);
	const directory = sceneDirectory(sceneId);
	const path = resolve(directory, file);
	const relativePath = relative(directory, path);
	if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
		throw new RangeError('Voiceover file is outside the scene directory');
	}
	return path;
}

async function assertClipExists(sceneId: string, file: string): Promise<void> {
	try {
		await access(assertClipFile(sceneId, file));
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

async function writeManifest(manifest: VoiceoverManifest): Promise<void> {
	await mkdir(sceneDirectory(manifest.sceneId), { recursive: true });
	await writeFileAtomic(manifestPath(manifest.sceneId), `${JSON.stringify(manifest, null, 2)}\n`);
}

function assertNoOverlap(clips: readonly VoiceoverClip[], candidate: VoiceoverClip): void {
	for (const clip of clips) {
		if (clip.id !== candidate.id && voiceoverOverlaps(clip, candidate)) {
			throw new RangeError('Voiceover recordings cannot overlap');
		}
	}
}

export function voiceoverFilePath(sceneId: string, file: string): string {
	return assertClipFile(sceneId, file);
}

export async function readVoiceoverManifest(sceneId: string): Promise<VoiceoverManifest> {
	validateSceneId(sceneId);
	try {
		const contents = await readFile(manifestPath(sceneId), 'utf8');
		const manifest = validateVoiceoverManifest(JSON.parse(contents));
		if (manifest.sceneId !== sceneId) {
			throw new Error(`Voiceover manifest scene does not match ${sceneId}`);
		}
		await Promise.all(manifest.clips.map((clip) => assertClipExists(sceneId, clip.file)));
		return manifest;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return { version: 1, sceneId, timelineFps: 60, clips: [] };
		}
		throw error;
	}
}

export async function saveVoiceover(input: {
	sceneId: string;
	id?: string;
	timelineFps: number;
	start: number;
	duration: number;
	mime: string;
	label?: string;
	data: string;
}): Promise<VoiceoverClip> {
	return enqueue(async () => {
		const manifest = await readVoiceoverManifest(input.sceneId);
		validateTimelineFps(input.timelineFps);
		const id = input.id ?? randomUUID();
		const file = `${id}.${extensionForMime(input.mime)}`;
		const data = Buffer.from(input.data, 'base64');
		if (data.byteLength === 0 || data.byteLength > MAX_RECORDING_BYTES) {
			throw new RangeError('Voiceover recording is empty or too large');
		}

		const clip = validateVoiceoverClip({
			id,
			sceneId: input.sceneId,
			label: input.label,
			file,
			start: input.start,
			duration: input.duration,
			mime: input.mime
		});
		assertNoOverlap(manifest.clips, clip);

		const directory = sceneDirectory(input.sceneId);
		await mkdir(directory, { recursive: true });
		const audioPath = assertClipFile(input.sceneId, file);
		await writeFileAtomic(audioPath, data);
		try {
			const clips = sortVoiceoverClips([
				...manifest.clips.filter((existing) => existing.id !== id),
				clip
			]);
			await writeManifest({ ...manifest, timelineFps: input.timelineFps, clips });
		} catch (error) {
			await rm(audioPath, { force: true });
			throw error;
		}
		return clip;
	});
}

export async function moveVoiceover(input: {
	sceneId: string;
	id: string;
	start: number;
}): Promise<VoiceoverClip> {
	return enqueue(async () => {
		const manifest = await readVoiceoverManifest(input.sceneId);
		const existing = manifest.clips.find((clip) => clip.id === input.id);
		if (!existing) throw new Error('Voiceover recording was not found');

		const moved = validateVoiceoverClip({ ...existing, start: input.start });
		assertNoOverlap(manifest.clips, moved);
		const clips = sortVoiceoverClips(
			manifest.clips.map((clip) => (clip.id === moved.id ? moved : clip))
		);
		await writeManifest({ ...manifest, clips });
		return moved;
	});
}

export async function deleteVoiceover(input: { sceneId: string; id: string }): Promise<void> {
	await enqueue(async () => {
		const manifest = await readVoiceoverManifest(input.sceneId);
		const existing = manifest.clips.find((clip) => clip.id === input.id);
		if (!existing) return;

		await writeManifest({
			...manifest,
			clips: manifest.clips.filter((clip) => clip.id !== input.id)
		});
		await rm(assertClipFile(input.sceneId, existing.file), { force: true });
	});
}

export async function readVoiceoverFile(sceneId: string, file: string): Promise<Buffer> {
	const manifest = await readVoiceoverManifest(sceneId);
	if (!manifest.clips.some((clip) => clip.file === file)) {
		throw new Error('Voiceover recording is not listed in the manifest');
	}
	return readFile(assertClipFile(sceneId, file));
}
