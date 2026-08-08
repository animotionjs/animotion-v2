#!/usr/bin/env node
import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { chromium, type Browser, type Page } from 'playwright';
import { resolveScenes } from './scenes.ts';
import type { RenderBridge } from '../lib/scene/runtime/render-bridge.js';
import type { FrameFormat } from '../lib/scene/options.js';

declare global {
	interface Window {
		__sequenceRenderer?: RenderBridge;
	}
}

type ParsedArgs = {
	out?: string;
	fps?: number;
	width?: number;
	height?: number;
	jobs?: number;
	framesOnly?: boolean;
	keepFrames?: boolean;
	progressBar?: boolean;
	format?: FrameFormat;
	jpegQuality?: number;
	preview?: boolean;
	gpu?: boolean;
	bench?: boolean;
	scenes: string[];
};

type ResolvedArgs = {
	out: string;
	outSet: boolean;
	fps: number;
	width: number;
	height: number;
	jobs: number;
	framesOnly: boolean;
	keepFrames: boolean;
	progressBar: boolean;
	format: FrameFormat;
	jpegQuality: number;
	gpu: boolean;
	bench: boolean;
	scenes: string[];
};

/** Destination for captured frames: ffmpeg stdin (streaming) or disk files. */
type FrameSink = {
	write(buf: Buffer): Promise<void>;
	close(): Promise<void>;
	abort?(): void;
};

const parsedArgs = parseArgs(process.argv.slice(2));
let server: ChildProcess | null = null;
let browser: Browser | null = null;
let isCrashed = false;
const pageErrors: string[] = [];
const sceneStats: { id: string; frames: number; ms: number }[] = [];
const progress: {
	id: string;
	frames: number;
	done: boolean;
	startMs: number;
	finalMs: number;
}[] = [];
let statusTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Render pipeline: starts a Vite dev server, launches headless Chromium,
 * probes the page for `window.__sequenceRenderer` to learn the scene list and
 * render options, then captures each scene with a pool of workers and encodes
 * the frames to video (unless `--frames-only`).
 */
async function main() {
	if (process.argv.includes('--help') || process.argv.includes('-h')) {
		console.log(`animotion render [scenes...]

Record a presentation into a video.

Arguments:
  scenes             scene ids to render individually (default: all scenes)

Options:
  --out <path>       output video file (default: from config render options)
  --fps <number>     frames per second (default: from config render options)
  --width <number>   video width (default: from config render options)
  --height <number>  video height (default: from config render options)
  --jobs <number>    parallel render workers (default: from config render options)
  --jpeg [quality]   capture frames as JPEG at the given quality (default 95)
                     instead of lossless PNG for faster rendering
  --png              force lossless PNG capture (default; use with --jpeg to
                     switch back in a preview render)
  --preview          fast draft render: half resolution, 30 fps, JPEG capture
  --gpu              prefer hardware acceleration (auto-falls back to software)
  --bench            measure per-frame capture cost (png vs jpeg) without rendering
  --frames-only      save frames without encoding video
  --keep-frames      keep rendered frames after encoding (forces file capture)
  --progress-bar     show a progress bar

By default frames are streamed straight into ffmpeg while they are captured.
Pass --frames-only or --keep-frames to write frames to rendered/frames/ instead.

Defaults are set in configure({ render }) in src/lib/config/configure.ts;
CLI flags override them.

Examples:
  animotion render
  animotion render first second
  animotion render 01-first 02-second --fps 30
`);
		process.exit(0);
	}

	const renderStart = performance.now();
	console.log('Starting dev server...');
	server = spawn(
		resolve('node_modules/.bin/vite'),
		['dev', '--port', '4173', '--host', '127.0.0.1', '--strictPort'],
		{
			stdio: ['ignore', 'ignore', 'inherit']
		}
	);
	server.on('error', (err) => {
		console.error('Failed to start vite:', err.message);
		process.exit(1);
	});
	server.on('exit', (code) => {
		if (code !== null && code !== 0) {
			console.error(`Vite exited unexpectedly (code ${code}). Is port 4173 already in use?`);
			process.exit(1);
		}
	});

	try {
		await waitForServer('http://127.0.0.1:4173');
	} catch (e) {
		server.kill();
		throw e;
	}

	console.log('Dev server ready on http://127.0.0.1:4173');

	console.log('Launching browser...');
	let gpuActive = parsedArgs.gpu === true;
	browser = await launchBrowser(gpuActive);

	async function acquireProbe() {
		const tempPage = await browser!.newPage({
			deviceScaleFactor: 1
		});
		tempPage.on('crash', () => {
			isCrashed = true;
		});
		await tempPage.goto(`http://127.0.0.1:4173/?render=video`, { waitUntil: 'domcontentloaded' });
		await tempPage.waitForFunction(() => window.__sequenceRenderer !== undefined);
		const probe = await tempPage.evaluate(() => {
			const r = window.__sequenceRenderer!;
			return { scenes: r.scenes, renderOptions: r.renderOptions };
		});
		const gpuHealthy = gpuActive ? await checkGpuHealth(tempPage) : true;
		await tempPage.close();
		return { ...probe, gpuHealthy };
	}

	let probe = await acquireProbe();
	if (gpuActive && !probe.gpuHealthy) {
		console.warn('GPU acceleration appears unavailable, falling back to software rendering.');
		await browser.close();
		gpuActive = false;
		browser = await launchBrowser(false);
		probe = await acquireProbe();
	}
	const { scenes, renderOptions } = probe;

	const args: ResolvedArgs = {
		out: parsedArgs.out ?? renderOptions.out,
		outSet: parsedArgs.out !== undefined,
		fps: parsedArgs.fps ?? (parsedArgs.preview ? 30 : renderOptions.fps),
		width:
			parsedArgs.width ??
			(parsedArgs.preview ? previewDim(renderOptions.width) : renderOptions.width),
		height:
			parsedArgs.height ??
			(parsedArgs.preview ? previewDim(renderOptions.height) : renderOptions.height),
		jobs: parsedArgs.jobs ?? renderOptions.jobs,
		framesOnly: parsedArgs.framesOnly ?? renderOptions.framesOnly,
		keepFrames: parsedArgs.keepFrames ?? renderOptions.keepFrames,
		progressBar: parsedArgs.progressBar ?? renderOptions.progressBar,
		format: parsedArgs.format ?? (parsedArgs.preview ? 'jpeg' : renderOptions.format),
		jpegQuality: parsedArgs.jpegQuality ?? renderOptions.jpegQuality,
		gpu: gpuActive,
		bench: parsedArgs.bench ?? false,
		scenes: parsedArgs.scenes
	};
	const renderQs = args.progressBar ? 'render=video&progress=1' : 'render=video';

	const perScene = args.scenes.length > 0;
	const targets = perScene ? resolveScenes(args.scenes, scenes) : scenes;

	if (perScene && args.outSet && targets.length > 1) {
		console.error('--out can only be used when rendering a single scene');
		process.exit(1);
	}

	const workerCount = Math.min(args.jobs, targets.length);

	console.log(
		`Rendering ${targets.length} scene${targets.length === 1 ? '' : 's'} with ${workerCount} ${workerCount === 1 ? 'worker' : 'workers'}...`
	);

	progress.length = 0;
	for (const id of targets) progress.push({ id, frames: 0, done: false, startMs: 0, finalMs: 0 });

	let nextIndex = 0;
	function popScene(): string | null {
		const i = nextIndex;
		if (i >= targets.length) return null;
		nextIndex = i + 1;
		return targets[i];
	}

	for (let i = 0; i < targets.length; i++) process.stdout.write('\n');
	statusTimer = setInterval(printStatus, 200);

	const workers: Promise<void>[] = [];
	for (let w = 0; w < workerCount; w++) {
		workers.push(runWorker(browser!, args, targets, popScene, renderQs));
	}
	await Promise.all(workers);

	if (statusTimer) {
		clearInterval(statusTimer);
		statusTimer = null;
	}
	printStatus();

	if (isCrashed) {
		console.error('One or more pages crashed during render.');
		process.exit(1);
	}

	const totalFrames = sceneStats.reduce((s, x) => s + x.frames, 0);
	const captureElapsed = (performance.now() - renderStart) / 1000;
	if (args.bench) {
		console.log(`Bench complete (${args.gpu ? 'gpu' : 'software'} rendering).`);
		return;
	}
	console.log(
		`Captured ${targets.length} scenes, ${totalFrames} frames in ${captureElapsed.toFixed(2)}s`
	);

	const streaming = !args.framesOnly && !args.keepFrames;

	if (!args.framesOnly) {
		const encodeStart = performance.now();

		if (streaming) {
			// Frames were already piped into per-scene ffmpeg processes during
			// capture, so only a concat remains for full-presentation renders.
			if (perScene) {
				for (const id of targets) {
					console.log(`Done. Output: ${resolve(sceneOutput(id, args))}`);
				}
			} else {
				console.log('Encoding final video...');
				await concatSceneVideos(targets, args.out);
				console.log('Done. Output:', resolve(args.out));
			}
		} else {
			await mkdir(resolve(dirname(args.out)), { recursive: true });

			if (perScene) {
				for (const id of targets) {
					console.log(`Encoding ${id}...`);
					const sceneStart = performance.now();
					await encodeSceneVideo(id, args);
					console.log(
						`Done. Output: ${resolve(sceneOutput(id, args))} (${((performance.now() - sceneStart) / 1000).toFixed(2)}s)`
					);
				}
				if (!args.keepFrames) {
					for (const id of targets) {
						await rm(resolve('rendered/frames', id), { recursive: true, force: true });
					}
					await rm(resolve('rendered', 'frames'), { recursive: true, force: true });
				}
			} else {
				console.log('Encoding final video...');
				await encodeFinalVideo(scenes, args);
				console.log('Done. Output:', resolve(args.out));
			}
		}

		const encodeElapsed = (performance.now() - encodeStart) / 1000;
		const totalElapsed = (performance.now() - renderStart) / 1000;
		console.log(
			`Total: ${totalElapsed.toFixed(2)}s (capture ${captureElapsed.toFixed(2)}s, encode ${encodeElapsed.toFixed(2)}s)`
		);
	} else {
		console.log('Done. Frames saved in rendered/frames/');
	}
}

function printStatus() {
	process.stdout.write(`\x1b[${progress.length}A`);
	const now = performance.now();
	for (let i = 0; i < progress.length; i++) {
		const p = progress[i];
		const elapsed = p.done ? p.finalMs : p.startMs ? now - p.startMs : 0;
		const line = `  [${i + 1}/${progress.length}] ${p.id.padEnd(12)} ${p.frames} frames  ${(elapsed / 1000).toFixed(2)}s`;
		process.stdout.write('\r\x1b[K' + line + '\n');
	}
}

/**
 * Worker loop: owns one browser page and captures scenes one at a time,
 * popping ids off a shared queue. Collects page errors and crashes into
 * module-level state so the final exit code reflects them.
 */
async function runWorker(
	b: Browser,
	args: ResolvedArgs,
	targets: string[],
	popScene: () => string | null,
	renderQs: string
): Promise<void> {
	const page = await b.newPage({
		deviceScaleFactor: 1
	});
	await page.setViewportSize({ width: args.width, height: args.height });

	page.on('pageerror', (err) => {
		pageErrors.push(err.message);
	});
	page.on('crash', () => {
		isCrashed = true;
	});
	page.on('console', (msg) => {
		if (msg.type() === 'error') pageErrors.push(msg.text());
	});

	try {
		while (true) {
			if (isCrashed) break;
			const id = popScene();
			if (!id) break;

			const sceneIndex = targets.indexOf(id);
			const isLast = id === targets[targets.length - 1];

			if (args.bench) {
				await benchScene(page, id, args, renderQs);
				progress[sceneIndex].done = true;
				progress[sceneIndex].finalMs = 0;
				continue;
			}

			await page.goto(`http://127.0.0.1:4173/${id}?${renderQs}`, {
				waitUntil: 'domcontentloaded',
				timeout: 10000
			});
			await page.waitForFunction(() => {
				const r = window.__sequenceRenderer;
				if (!r) return false;
				const m = r.manager;
				return m.totalSteps > 0 || m.phase !== 'finished' || m.transitionActive;
			});

			const streaming = !args.framesOnly && !args.keepFrames;
			const out = args.scenes.length > 0 ? sceneOutput(id, args) : resolve('rendered', `${id}.mp4`);
			let sink: FrameSink;
			if (streaming) {
				await mkdir(resolve(dirname(out)), { recursive: true });
				sink = createStreamSink(args, out);
			} else {
				sink = await createFileSink(id, args);
			}

			progress[sceneIndex].startMs = performance.now();
			try {
				const frames = await captureScene(page, id, isLast, args, sceneIndex, sink);
				const ms = performance.now() - progress[sceneIndex].startMs;
				progress[sceneIndex].done = true;
				progress[sceneIndex].finalMs = ms;
				sceneStats.push({ id, frames, ms });
				await sink.close();
			} catch (err) {
				sink.abort?.();
				throw err;
			}
		}
	} finally {
		await page.close().catch(() => {});
	}
}

/**
 * Records one scene frame by frame: the enter transition, each step (advanced
 * via `manager.next()`), then the exit transition (skipped for the last
 * scene). Frames are produced by driving the render scheduler `1/fps` seconds
 * at a time until it reports idle; hang guards abort on runaway loops.
 *
 * @returns the number of frames written
 */
async function captureScene(
	page: Page,
	id: string,
	isLast: boolean,
	args: ResolvedArgs,
	sceneIndex: number,
	sink: FrameSink
): Promise<number> {
	let frameIndex = 1;
	const writeFrame = async (buf: Buffer) => {
		progress[sceneIndex].frames = frameIndex;
		await sink.write(buf);
		frameIndex++;
	};

	const maxFrames = args.fps * 60;
	let guard = 0;

	await writeFrame(await safeScreenshot(page, args));

	// enter transition + initial step animation
	while (true) {
		if (isCrashed) throw new Error(`Page crashed during enter of ${id}`);
		if (++guard > maxFrames) throw new Error(`Enter hang on ${id}: >${maxFrames} frames`);
		const { done } = await page.evaluate(
			(delta: number) => window.__sequenceRenderer!.advanceFrame(delta),
			1 / args.fps
		);
		await writeFrame(await safeScreenshot(page, args));
		if (done) break;
	}

	// steps
	guard = 0;
	while (true) {
		if (isCrashed) throw new Error(`Page crashed during steps of ${id}`);
		const finished = await page.evaluate(() => window.__sequenceRenderer!.manager.finished);
		if (finished) break;
		if (++guard > 200) {
			throw new Error(`Step loop hang on ${id}: too many step invocations`);
		}

		await page.evaluate(() => window.__sequenceRenderer!.manager.next());
		await writeFrame(await safeScreenshot(page, args));

		let stepGuard = 0;
		while (true) {
			if (isCrashed) throw new Error(`Page crashed during step animation of ${id}`);
			if (++stepGuard > maxFrames) {
				throw new Error(`Step animation hang on ${id}: >${maxFrames} frames`);
			}
			const { done } = await page.evaluate(
				(delta: number) => window.__sequenceRenderer!.advanceFrame(delta),
				1 / args.fps
			);
			await writeFrame(await safeScreenshot(page, args));
			if (done) break;
		}
	}

	if (isLast) return frameIndex - 1;

	// exit transition
	guard = 0;
	await page.evaluate(() => {
		const d = window.__sequenceRenderer!;
		d.manager.setDirection('forward');
		d.manager.playExit();
	});
	await writeFrame(await safeScreenshot(page, args));
	while (true) {
		if (isCrashed) throw new Error(`Page crashed during exit of ${id}`);
		if (++guard > maxFrames) throw new Error(`Exit hang on ${id}: >${maxFrames} frames`);
		const { done } = await page.evaluate(
			(delta: number) => window.__sequenceRenderer!.advanceFrame(delta),
			1 / args.fps
		);
		await writeFrame(await safeScreenshot(page, args));
		if (done) break;
	}
	return frameIndex - 1;
}

const BENCH_FRAMES = 60;

/**
 * Measures per-frame cost without rendering anything to disk: reloads the
 * scene fresh, then times the `advanceFrame` round-trip and the screenshot
 * separately while the enter transition plays and again while the first step
 * runs. Both phases are measured for PNG and JPEG. Prints an aggregate line
 * per format.
 */
async function benchScene(page: Page, id: string, args: ResolvedArgs, renderQs: string) {
	for (const format of ['png', 'jpeg'] as const) {
		await page.goto(`http://127.0.0.1:4173/${id}?${renderQs}`, {
			waitUntil: 'domcontentloaded',
			timeout: 10000
		});
		await page.waitForFunction(() => {
			const r = window.__sequenceRenderer;
			if (!r) return false;
			const m = r.manager;
			return m.totalSteps > 0 || m.phase !== 'finished' || m.transitionActive;
		});

		const opts: { type: 'png' } | { type: 'jpeg'; quality: number } =
			format === 'jpeg' ? { type: 'jpeg', quality: args.jpegQuality } : { type: 'png' };
		const enter = await timedLoop(page, args, opts);
		const finished = await page.evaluate(() => window.__sequenceRenderer!.manager.finished);
		let step: { evaluate: number[]; capture: number[] } | null = null;
		if (!finished) {
			await page.evaluate(() => window.__sequenceRenderer!.manager.next());
			step = await timedLoop(page, args, opts);
		}

		const parts = [
			`bench ${id}  format=${format}`,
			`evaluate_avg=${avg(enter.evaluate).toFixed(1)}ms`,
			`enter_capture_avg=${avg(enter.capture).toFixed(1)}ms`,
			step
				? `step_capture_avg=${avg(step.capture).toFixed(1)}ms  step_capture_p95=${p95(step.capture).toFixed(1)}ms`
				: 'no_steps'
		];
		console.log(parts.join('  '));
	}
}

/** Advances the scene and screenshots until done or {@link BENCH_FRAMES} frames, timing each stage. */
async function timedLoop(
	page: Page,
	args: ResolvedArgs,
	opts: { type: 'png' } | { type: 'jpeg'; quality: number }
): Promise<{ evaluate: number[]; capture: number[] }> {
	const evaluate: number[] = [];
	const capture: number[] = [];
	for (let i = 0; i < BENCH_FRAMES; i++) {
		const t0 = performance.now();
		const { done } = await page.evaluate(
			(delta: number) => window.__sequenceRenderer!.advanceFrame(delta),
			1 / args.fps
		);
		const t1 = performance.now();
		await page.screenshot(opts);
		const t2 = performance.now();
		evaluate.push(t1 - t0);
		capture.push(t2 - t1);
		if (done && i > 0) break;
	}
	return { evaluate, capture };
}

function avg(values: number[]): number {
	return values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : 0;
}

function p95(values: number[]): number {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

/** Concatenates every scene's frame sequence into a single video with ffmpeg. */
async function encodeFinalVideo(slugs: string[], args: ResolvedArgs) {
	const inputs: string[] = [];
	for (const id of slugs) {
		inputs.push(
			'-framerate',
			String(args.fps),
			'-i',
			join('rendered/frames', id, `frame_%06d.${args.format}`)
		);
	}

	const filter = `concat=n=${slugs.length}:v=1:a=0[outv]`;

	await runFfmpeg([
		'-y',
		'-loglevel',
		'error',
		...inputs,
		'-filter_complex',
		filter,
		'-map',
		'[outv]',
		...encodeFlags(args.out)
	]);

	if (!args.keepFrames) await cleanupFrames(slugs);
}

/** Encodes a single scene's frames into its own video file. */
async function encodeSceneVideo(id: string, args: ResolvedArgs) {
	await runFfmpeg([
		'-y',
		'-loglevel',
		'error',
		'-framerate',
		String(args.fps),
		'-i',
		join('rendered/frames', id, `frame_%06d.${args.format}`),
		...encodeFlags(sceneOutput(id, args))
	]);
}

/**
 * Stitches per-scene videos (encoded during capture) into a single video.
 * All scenes share identical encoder settings, so the streams are copied.
 */
async function concatSceneVideos(ids: string[], out: string) {
	await mkdir(resolve(dirname(out)), { recursive: true });
	const listPath = resolve('rendered', 'concat.txt');
	const list = ids.map((id) => `file '${resolve('rendered', `${id}.mp4`)}'`).join('\n');
	await writeFile(listPath, list);
	try {
		await runFfmpeg([
			'-y',
			'-loglevel',
			'error',
			'-f',
			'concat',
			'-safe',
			'0',
			'-i',
			listPath,
			'-c',
			'copy',
			out
		]);
	} finally {
		await rm(listPath, { force: true });
	}
	for (const id of ids) {
		const path = resolve('rendered', `${id}.mp4`);
		if (path === resolve(out)) continue;
		await rm(path, { force: true });
	}
}

function sceneOutput(id: string, args: ResolvedArgs): string {
	if (args.outSet && args.scenes.length === 1) return args.out;
	return resolve('rendered', `${id}.mp4`);
}

function encodeFlags(out: string): string[] {
	return [
		'-c:v',
		'libx264',
		'-preset',
		'veryfast',
		'-pix_fmt',
		'yuv420p',
		'-crf',
		'18',
		'-fps_mode',
		'cfr',
		'-movflags',
		'+faststart',
		out
	];
}

async function runFfmpeg(argv: string[]) {
	await new Promise<void>((resolve, reject) => {
		const ff = spawn(ffmpeg!, argv) as ChildProcessWithoutNullStreams;
		ff.stderr.on('data', (d: Buffer) => process.stderr.write(d));

		ff.on('error', (err) => reject(new Error(`ffmpeg error: ${err.message}`)));
		ff.on('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`ffmpeg exited with code ${code}`));
		});
	});
}

async function cleanupFrames(ids: string[]) {
	for (const id of ids) {
		await rm(resolve('rendered/frames', id), { recursive: true, force: true });
	}
	await rm(resolve('rendered', 'frames'), { recursive: true, force: true });
}

/** Launches headless Chromium, preferring hardware acceleration when `gpu`. */
function launchBrowser(gpu: boolean): Promise<Browser> {
	const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
	if (gpu) {
		args.push('--enable-gpu', '--enable-unsafe-swiftshader');
	} else {
		args.push('--disable-gpu');
	}
	return chromium.launch({ headless: true, args });
}

/**
 * Verifies the GPU-enabled browser can actually render: a WebGL context must
 * be creatable and a screenshot must not be blank. Returns false so the caller
 * can fall back to software rendering.
 */
async function checkGpuHealth(page: Page): Promise<boolean> {
	try {
		const webglOk = await page.evaluate(() => {
			try {
				const c = document.createElement('canvas');
				const gl =
					(c.getContext('webgl2') as WebGL2RenderingContext | null) ||
					(c.getContext('webgl') as WebGLRenderingContext | null);
				if (!gl) return false;
				gl.clearColor(1, 0, 0, 1);
				gl.clear(gl.COLOR_BUFFER_BIT);
				gl.finish();
				return true;
			} catch {
				return false;
			}
		});
		if (!webglOk) return false;
		const buf = await page.screenshot({ type: 'png' });
		return !isBlankBuffer(buf);
	} catch {
		return false;
	}
}

/** Heuristic: a buffer whose sampled bytes are all identical is treated as blank. */
function isBlankBuffer(buf: Buffer): boolean {
	const step = Math.max(1, Math.floor(buf.length / 200));
	const first = buf[0];
	for (let i = step; i < buf.length; i += step) {
		if (buf[i] !== first) return false;
	}
	return true;
}

function cleanup() {
	if (browser) browser.close().catch(() => {});
	if (server) server.kill();
}

/**
 * Takes a screenshot (PNG or JPEG per `args.format`), retrying after a delay
 * on transient failures. Fails fast if the page has crashed.
 */
async function safeScreenshot(page: Page, args: ResolvedArgs, retries = 3): Promise<Buffer> {
	if (isCrashed) throw new Error('Page has crashed, aborting');
	const options =
		args.format === 'jpeg'
			? ({ type: 'jpeg', quality: args.jpegQuality } as const)
			: ({ type: 'png' } as const);
	for (let attempt = 0; attempt < retries; attempt++) {
		try {
			return await page.screenshot(options);
		} catch (err) {
			if (attempt === retries - 1) throw err;
			console.warn(`Screenshot failed (attempt ${attempt + 1}/${retries}), retrying...`);
			await new Promise((r) => setTimeout(r, 1000));
		}
	}
	throw new Error('unreachable');
}

/** Writes frames to rendered/frames/<id>/frame_%06d.<format> on disk. */
async function createFileSink(id: string, args: ResolvedArgs): Promise<FrameSink> {
	const frameDir = resolve('rendered/frames', id);
	await mkdir(frameDir, { recursive: true });
	let index = 0;
	return {
		async write(buf) {
			const path = join(frameDir, `frame_${String(++index).padStart(6, '0')}.${args.format}`);
			await writeFile(path, buf);
		},
		async close() {}
	};
}

/**
 * Pipes frames into an ffmpeg process that encodes the scene video as frames
 * arrive, so capture and encoding overlap and no files are written to disk.
 */
function createStreamSink(args: ResolvedArgs, out: string): FrameSink {
	const proc = spawn(ffmpeg!, [
		'-y',
		'-loglevel',
		'error',
		'-f',
		'image2pipe',
		'-framerate',
		String(args.fps),
		'-i',
		'-',
		...encodeFlags(out)
	]) as ChildProcessWithoutNullStreams;

	const stderr: Buffer[] = [];
	proc.stderr.on('data', (d: Buffer) => stderr.push(d));
	const exit = new Promise<number>((resolve) => proc.on('exit', (code) => resolve(code ?? -1)));

	return {
		async write(buf) {
			const ok = proc.stdin.write(buf);
			if (!ok) await once(proc.stdin, 'drain');
		},
		async close() {
			proc.stdin.end();
			const code = await exit;
			if (code !== 0) {
				throw new Error(
					`ffmpeg exited with code ${code}: ${Buffer.concat(stderr).toString('utf8')}`
				);
			}
		},
		abort() {
			proc.kill();
			rm(out, { force: true }).catch(() => {});
		}
	};
}

/** Halves `n` to an even number, with a floor of 2, for preview renders. */
function previewDim(n: number): number {
	const half = Math.floor(n / 2);
	return Math.max(2, half - (half % 2));
}

/** Parses CLI flags and collects non-flag arguments as scene ids. */
function parseArgs(argv: string[]): ParsedArgs {
	const args: ParsedArgs = {
		scenes: []
	};

	for (let i = 0; i < argv.length; i++) {
		switch (argv[i]) {
			case '--out':
				args.out = argv[++i];
				break;
			case '--fps': {
				const val = parseInt(argv[++i], 10);
				if (Number.isNaN(val)) {
					console.error('--fps requires a number');
					process.exit(1);
				}
				args.fps = val;
				break;
			}
			case '--width': {
				const val = parseInt(argv[++i], 10);
				if (Number.isNaN(val)) {
					console.error('--width requires a number');
					process.exit(1);
				}
				args.width = val;
				break;
			}
			case '--height': {
				const val = parseInt(argv[++i], 10);
				if (Number.isNaN(val)) {
					console.error('--height requires a number');
					process.exit(1);
				}
				args.height = val;
				break;
			}
			case '--jobs': {
				const val = parseInt(argv[++i], 10);
				if (Number.isNaN(val) || val < 1) {
					console.error('--jobs requires a positive integer');
					process.exit(1);
				}
				args.jobs = val;
				break;
			}
			case '--frames-only':
				args.framesOnly = true;
				break;
			case '--keep-frames':
				args.keepFrames = true;
				break;
			case '--progress-bar':
				args.progressBar = true;
				break;
			case '--preview':
				args.preview = true;
				break;
			case '--gpu':
				args.gpu = true;
				break;
			case '--bench':
				args.bench = true;
				break;
			case '--png':
				args.format = 'png';
				break;
			case '--jpeg':
				args.format = 'jpeg';
				if (argv[i + 1] !== undefined && /^\d+$/.test(argv[i + 1])) {
					const quality = parseInt(argv[++i], 10);
					if (quality < 0 || quality > 100) {
						console.error('--jpeg quality must be between 0 and 100');
						process.exit(1);
					}
					args.jpegQuality = quality;
				}
				break;
			default:
				args.scenes.push(argv[i]);
		}
	}
	return args;
}

/** Polls `url` until it responds OK, or throws once `timeout` ms elapses. */
async function waitForServer(url: string, timeout = 30000) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		try {
			const res = await fetch(url);
			if (res.ok) return;
		} catch {
			// server not up yet; retry
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error('Server did not start within ' + timeout + 'ms');
}

main()
	.then(() => {
		cleanup();
		process.exit(pageErrors.length > 0 ? 1 : 0);
	})
	.catch((err) => {
		console.error(err);
		cleanup();
		if (pageErrors.length > 0) {
			console.error('Page errors:');
			for (const e of pageErrors) console.error('  -', e);
		}
		process.exit(1);
	});

process.on('SIGINT', () => {
	cleanup();
	process.exit(130);
});
process.on('SIGTERM', () => {
	cleanup();
	process.exit(143);
});
