import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
/*
 * Applying the project config keeps the default output path in sync with
 * what a terminal render would use.
 */
import '#lib/config/configure.js';
import { getOptions, PREVIEW_JPEG_QUALITY, resolveRenderSize } from '../scene/options.js';
import { flushVoiceoverWrites } from './voiceovers.js';
import { parseRenderReport } from '../scene/runtime/report.js';
import type { AspectRatio, ResolutionName } from '../scene/options.js';

/*
 * The CLI ships inside the library so the same import works in the repo and
 * the installed package, which resolves it to the compiled JavaScript build
 */
let RENDER_SCRIPT: string;
try {
	RENDER_SCRIPT = fileURLToPath(import.meta.resolve('#lib/cli/render.ts'));
} catch {
	throw new Error('Could not locate the CLI');
}
const OUT_DIR = 'rendered';
const OPENERS: Partial<Record<NodeJS.Platform, string>> = { darwin: 'open', win32: 'explorer' };

export interface StartRenderInput {
	/** Scene id to render, or null for the whole presentation. */
	scene: string | null;
	aspect: AspectRatio;
	resolution: ResolutionName;
	fps: number;
	/** Speed versus fidelity tradeoff picked in the timeline UI. */
	quality: QualityTier;
	/** Whether frames become a single video or a folder of image files. */
	output: 'video' | 'images';
	/** Origin of the dev server the renderer should attach to. */
	origin: string;
}

export type QualityTier = 'full' | 'balanced' | 'preview';

export type RenderPhase =
	'idle' | 'starting' | 'downloading' | 'measuring' | 'rendering' | 'encoding' | 'done' | 'failed';

export interface RenderSnapshot {
	phase: RenderPhase;
	percent: number;
	output: string | null;
	error: string | null;
	/** Wall time of a finished render, or null while it has none. */
	duration: number | null;
}

let child: ChildProcess | null = null;
let startedAt = 0;
let current: RenderSnapshot = {
	phase: 'idle',
	percent: 0,
	output: null,
	error: null,
	duration: null
};
let cleanupHooked = false;
let outputFolder = '';

function update(change: Partial<RenderSnapshot>) {
	current = { ...current, ...change };
}

/** Phases where the renderer process is still doing work and may be killed. */
function inFlight(phase: RenderPhase): boolean {
	return (
		phase === 'starting' ||
		phase === 'downloading' ||
		phase === 'measuring' ||
		phase === 'rendering' ||
		phase === 'encoding'
	);
}

/** Current render progress, read by the live status query. */
export function renderSnapshot() {
	return current;
}

/** Kills the running render, if any. */
export function cancelRender() {
	if (!child) return;
	child.kill();
	child = null;
	/*
	 * Resetting right away keeps a reload from ever showing stale state. The
	 * exit event of the killed process arrives later and sees idle.
	 */
	update({ phase: 'idle', output: null, error: null, duration: null });
}

/** Opens the folder of the last finished render in the platform file manager. */
export async function openRenderedFolder() {
	if (current.phase !== 'done' || !outputFolder) throw new Error('Nothing was rendered yet');
	const opener = OPENERS[process.platform] ?? 'xdg-open';
	return new Promise<void>((resolve, reject) => {
		const proc = spawn(opener, [outputFolder], { detached: true, stdio: 'ignore' });
		proc.on('error', () => reject(new Error(`Could not open ${outputFolder}`)));
		/*
		 * Windows explorer exits with code 1 even when it opened the folder,
		 * so there a spawn error is the only way the request can fail.
		 */
		proc.on('exit', (code) => {
			if (process.platform === 'win32' || code === 0) resolve();
			else reject(new Error(`Could not open ${outputFolder}`));
		});
		proc.unref();
	});
}

export async function startRender(input: StartRenderInput) {
	if (child) throw new Error('A render is already running');

	const { width, height } = resolveRenderSize(input.aspect, input.resolution);
	/*
	 * Drafts write to their own file, so a preview render never clobbers the
	 * full quality output.
	 */
	const suffix = input.quality === 'preview' ? '.preview' : '';
	let output: string;
	if (input.output === 'images') {
		output = input.scene ? `${OUT_DIR}/frames/${input.scene}` : `${OUT_DIR}/frames`;
	} else if (input.scene) {
		output = `${OUT_DIR}/${input.scene}${suffix}.mp4`;
	} else {
		output = getOptions().render.out.replace(/\.mp4$/, `${suffix}.mp4`);
	}

	startedAt = Date.now();
	update({ phase: 'starting', percent: 0, output, error: null, duration: null });

	/*
	 * Preview trades frame rate and capture quality for speed, never size,
	 * so its layout matches the final render exactly.
	 */
	const fps = input.quality === 'preview' ? 30 : input.fps;
	const flags = [
		'--server',
		input.origin,
		'--width',
		String(width),
		'--height',
		String(height),
		'--fps',
		String(fps)
	];
	if (input.quality === 'balanced') flags.push('--jpeg');
	if (input.quality === 'preview') flags.push('--jpeg', String(PREVIEW_JPEG_QUALITY));
	/*
	 * Images skip the encoder and land in rendered/frames, so a video out
	 * path is not needed for them.
	 */
	outputFolder = input.output === 'images' ? output : dirname(output);
	if (input.output === 'images') flags.push('--frames-only');
	if (input.scene) {
		flags.push(input.scene);
		if (input.output === 'video') flags.push('--out', output);
	}

	// ffmpeg only creates the video file, so the folder must exist first
	await mkdir(OUT_DIR, { recursive: true });
	await flushVoiceoverWrites();

	const renderer = spawn(process.execPath, [RENDER_SCRIPT, ...flags], {
		// the renderer logs to the same terminal that runs the dev server
		stdio: ['ignore', 'inherit', 'inherit', 'ipc']
	});
	child = renderer;

	if (!cleanupHooked) {
		cleanupHooked = true;
		// a dev server shutdown would otherwise leave the render running loose
		process.on('exit', () => child?.kill());
	}

	renderer.on('message', (message) => {
		const report = parseRenderReport(message);
		if (!report) return;
		if (report.type === 'encoding') update({ phase: 'encoding', percent: 100 });
		else if (report.type === 'progress') {
			update({
				phase: 'rendering',
				percent: Math.min(100, Math.round((report.done / report.total) * 100))
			});
		} else {
			update({ phase: report.type });
		}
	});

	renderer.on('error', (error) => {
		child = null;
		update({ phase: 'failed', error: error.message, duration: null });
	});

	renderer.on('exit', (code, signal) => {
		child = null;
		/*
		 * Only a render still in flight may settle the phase, so a cancel or
		 * an earlier failure cannot be overwritten by this late event.
		 */
		if (!inFlight(current.phase)) return;
		if (code === 0) update({ phase: 'done', percent: 100, duration: Date.now() - startedAt });
		else {
			update({
				phase: 'failed',
				error: code === null ? `Renderer killed (${signal})` : `Renderer exited with code ${code}`,
				duration: null
			});
		}
	});
}
