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
import { sliceRanges, type SliceRange } from '../lib/scene/runtime/slices.ts';

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
	slices?: number;
	separate?: boolean;
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
	slices: number;
	separate: boolean;
	scenes: string[];
};

/** A unit of work popped by a worker: one scene, or one frame range of one scene. */
type WorkItem = {
	id: string;
	sceneIndex: number;
	isLast: boolean;
	/** Null means capture the scene's full range from frame 1. */
	range: SliceRange | null;
	/** 1-based slice index within the scene (null when not slicing). */
	sliceK: number | null;
	sinkPath: string;
	bench: boolean;
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
  --slices [count]   capture each scene's frames across count parallel workers,
                     each handling a contiguous frame range (default 4). Helps
                     when some workers would otherwise be idle (fewer scenes
                     than --jobs); skipped otherwise. The scene must drive its
                     state purely from time/frame (no Math.random, Date.now, or
                     accumulated side-effects), since every slice runs in a
                     fresh tab. Streaming mode only; ignored with
                     --frames-only / --keep-frames / --bench
  --bench            measure per-frame capture cost (png vs jpeg) without rendering
  --separate         write one video per scene (rendered/<id>.mp4) instead of one
                     combined video
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
		slices: parsedArgs.slices ?? 1,
		separate: parsedArgs.separate ?? false,
		scenes: parsedArgs.scenes
	};
	const renderQs = args.progressBar ? 'render=video&progress=1' : 'render=video';

	const perScene = args.scenes.length > 0;
	const targets = perScene ? resolveScenes(args.scenes, scenes) : scenes;

	if (perScene && args.outSet && targets.length > 1) {
		console.error('--out can only be used when rendering a single scene');
		process.exit(1);
	}

	if (args.separate && args.outSet) {
		console.error(
			'--out cannot be combined with --separate (each scene gets its own rendered/<id>.mp4)'
		);
		process.exit(1);
	}

	const streaming = !args.framesOnly && !args.keepFrames;
	// Slicing turns a scene into several workers. It only helps when some
	// workers would otherwise sit idle — i.e. when there are fewer scenes than
	// jobs. With as many scenes as jobs, the workers are already saturated by
	// whole scenes, and slicing would only add page-load overhead (measured:
	// full-deck renders gain ~6%, not worth the capture-mode switch). Within
	// that constraint, only scenes long enough for the speedup to outweigh
	// their own page-load overhead get sliced (see SLICE_MIN_SECONDS below).
	const useSlices = args.slices > 1 && streaming && !args.bench && targets.length < args.jobs;

	progress.length = 0;
	for (const id of targets) progress.push({ id, frames: 0, done: false, startMs: 0, finalMs: 0 });

	if (args.slices > 1 && !streaming) {
		console.warn(
			'--slices requires streaming capture; ignoring it (pass neither --frames-only nor --keep-frames).'
		);
	} else if (args.slices > 1 && targets.length >= args.jobs) {
		console.warn(
			`--slices skipped: all ${args.jobs} workers are already used by the ${targets.length} scenes. ` +
				'Slicing only adds parallelism when there are idle workers (fewer scenes than --jobs).'
		);
	}

	const sliceCounts = new Map<string, number>();
	const items: WorkItem[] = [];

	// Minimum scene length (seconds of footage) for slicing to pay off: each
	// slice adds a ~1-2s page load, so a scene must be long enough that the
	// parallel speedup outweighs those loads.
	const SLICE_MIN_SECONDS = 4;

	if (useSlices) {
		// Every slice must start from a known frame, so measure each scene's
		// exact total frame count by driving it once without screenshots
		// (cheap: advance-only, ~0.5ms per frame).
		const dryPage = await browser!.newPage({ deviceScaleFactor: 1 });
		dryPage.on('crash', () => {
			isCrashed = true;
		});
		dryPage.on('pageerror', (err) => pageErrors.push(err.message));
		console.log('Measuring scene frame counts...');
		const totals: number[] = [];
		for (let i = 0; i < targets.length; i++) {
			const id = targets[i];
			const isLast = i === targets.length - 1;
			// settle=false: the frame count comes from the step math alone, so
			// there's no need to wait for network idle or asset loads.
			await loadScenePage(dryPage, id, renderQs, false);
			const { total } = await driveScene(dryPage, id, isLast, args, i, null, null);
			totals.push(total);
			console.log(`  ${id}: ${total} frames`);
		}
		await dryPage.close().catch(() => {});

		for (let i = 0; i < targets.length; i++) {
			const id = targets[i];
			const isLast = i === targets.length - 1;
			// Only slice scenes long enough that the per-slice page-load
			// overhead pays off (~4 seconds of footage at the render fps).
			const sliceCount =
				totals[i] >= SLICE_MIN_SECONDS * args.fps ? Math.min(args.slices, totals[i]) : 1;
			const ranges = sliceCount > 1 ? sliceRanges(totals[i], sliceCount) : null;
			sliceCounts.set(id, ranges?.length ?? 1);
			if (!ranges) {
				items.push({
					id,
					sceneIndex: i,
					isLast,
					range: null,
					sliceK: null,
					sinkPath: sceneVideoOut(id, perScene, args),
					bench: false
				});
				continue;
			}
			for (let k = 0; k < ranges.length; k++) {
				const sliceK = k + 1;
				items.push({
					id,
					sceneIndex: i,
					isLast,
					range: ranges[k],
					sliceK,
					sinkPath: sliceSinkPath(id, sliceK),
					bench: false
				});
			}
		}
	} else if (args.bench) {
		for (let i = 0; i < targets.length; i++) {
			items.push({
				id: targets[i],
				sceneIndex: i,
				isLast: i === targets.length - 1,
				range: null,
				sliceK: null,
				sinkPath: '',
				bench: true
			});
		}
	} else {
		for (let i = 0; i < targets.length; i++) {
			const id = targets[i];
			items.push({
				id,
				sceneIndex: i,
				isLast: i === targets.length - 1,
				range: null,
				sliceK: null,
				sinkPath: sceneVideoOut(id, perScene, args),
				bench: false
			});
		}
	}

	if (
		args.slices > 1 &&
		streaming &&
		sliceCounts.size > 0 &&
		![...sliceCounts.values()].some((n) => n > 1)
	) {
		console.warn(
			`--slices had no effect: none of the ${targets.length} scene${targets.length === 1 ? '' : 's'} ` +
				`has at least ${SLICE_MIN_SECONDS}s of footage (${SLICE_MIN_SECONDS * args.fps} frames at ${args.fps} fps), so every scene renders whole.`
		);
	}

	const workerCount = Math.min(args.jobs, items.length);

	console.log(
		`Rendering ${targets.length} scene${targets.length === 1 ? '' : 's'} with ${workerCount} ${workerCount === 1 ? 'worker' : 'workers'} (${items.length} item${items.length === 1 ? '' : 's'})...`
	);

	const remaining = new Map<string, number>();
	for (const item of items) {
		if (item.bench) continue;
		remaining.set(item.id, (remaining.get(item.id) ?? 0) + 1);
	}

	let nextIndex = 0;
	function popItem(): WorkItem | null {
		const i = nextIndex;
		if (i >= items.length) return null;
		nextIndex = i + 1;
		return items[i];
	}

	for (let i = 0; i < targets.length; i++) process.stdout.write('\n');
	statusTimer = setInterval(printStatus, 200);

	const workers: Promise<void>[] = [];
	for (let w = 0; w < workerCount; w++) {
		workers.push(runWorker(browser!, args, popItem, renderQs, remaining));
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

	if (!args.framesOnly) {
		const encodeStart = performance.now();

		if (streaming) {
			// Frames were already piped into ffmpeg during capture. Sliced
			// scenes have per-slice videos to stitch first; then only a
			// per-scene concat remains for full-presentation renders.
			if (useSlices) {
				for (const id of targets) {
					const count = sliceCounts.get(id) ?? 1;
					if (count <= 1) continue;
					console.log(`Stitching slices of ${id}...`);
					await concatSliceVideos(id, count, sceneVideoOut(id, perScene, args));
				}
				await rm(resolve('rendered', 'slices'), { recursive: true, force: true });
			}
			if (perScene) {
				for (const id of targets) {
					console.log(`Done. Output: ${resolve(sceneOutput(id, args))}`);
				}
			} else if (args.separate) {
				for (const id of targets) {
					console.log(`Done. Output: ${resolve('rendered', `${id}.mp4`)}`);
				}
			} else {
				console.log('Encoding final video...');
				await concatSceneVideos(targets, args.out);
				console.log('Done. Output:', resolve(args.out));
			}
		} else {
			await mkdir(resolve(dirname(args.out)), { recursive: true });

			if (perScene || args.separate) {
				await encodeEachScene(targets, args);
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
 * Worker loop: owns one browser page and captures work items one at a time,
 * popping them off a shared queue. Collects page errors and crashes into
 * module-level state so the final exit code reflects them.
 */
async function runWorker(
	b: Browser,
	args: ResolvedArgs,
	popItem: () => WorkItem | null,
	renderQs: string,
	remaining: Map<string, number>
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
			const item = popItem();
			if (!item) break;

			if (item.bench) {
				await benchScene(page, item.id, args, renderQs);
				progress[item.sceneIndex].done = true;
				progress[item.sceneIndex].finalMs = 0;
				continue;
			}

			await loadScenePage(page, item.id, renderQs);

			const streaming = !args.framesOnly && !args.keepFrames;
			let sink: FrameSink;
			if (streaming) {
				await mkdir(resolve(dirname(item.sinkPath)), { recursive: true });
				sink = createStreamSink(args, item.sinkPath);
			} else {
				sink = await createFileSink(item.id, args);
			}

			progress[item.sceneIndex].startMs ||= performance.now();
			try {
				const { written } = await driveScene(
					page,
					item.id,
					item.isLast,
					args,
					item.sceneIndex,
					item.range,
					sink
				);
				const ms = performance.now() - progress[item.sceneIndex].startMs;
				await sink.close();
				sceneStats.push({ id: item.id, frames: written, ms });
				const left = (remaining.get(item.id) ?? 1) - 1;
				remaining.set(item.id, left);
				if (left <= 0) {
					progress[item.sceneIndex].done = true;
					progress[item.sceneIndex].finalMs = ms;
				}
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
 * Navigates a page to a scene in render mode, waits for the renderer, and
 * gives asynchronous scene setup (model/image/video loads, dynamic imports)
 * time to finish before capture starts. Without this, a slice starting
 * mid-timeline pre-rolls in milliseconds and can capture a page whose async
 * content has not loaded yet. Best-effort: capture proceeds if the page never
 * goes quiet within the timeout.
 */
async function loadScenePage(page: Page, id: string, renderQs: string, settle = true) {
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
	if (settle) {
		// Wait for network idle plus a short buffer so asynchronous scene setup —
		// model/image/video loads, dynamic imports — is complete before any frame
		// is captured. Network idle already means nothing is in flight, so the
		// buffer only needs to cover post-load settling (e.g. texture uploads).
		await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
		await page.waitForTimeout(150);
	}
}

/**
 * Drives one scene frame by frame through the enter transition, each step
 * (advanced via `manager.next()`), then the exit transition (skipped for the
 * last scene), advancing the render scheduler `1/fps` seconds at a time until
 * it reports idle. Hang guards abort on runaway loops.
 *
 * The same function powers three modes:
 * - serial capture (`sink` set, `range` null): captures every frame from 1;
 * - time-sliced capture (`sink` set, `range` set): pre-rolls the manager
 *   through the frames before `range.start` without screenshots (the exact
 *   same `next()`/`advanceFrame` sequence as serial, so the state at each
 *   frame is identical), then captures frames `start..end`; and
 * - dry-run measuring (`sink` null): counts frames without screenshots.
 *
 * @returns `written` frames written to `sink`, and `total` frames covered.
 */
async function driveScene(
	page: Page,
	id: string,
	isLast: boolean,
	args: ResolvedArgs,
	sceneIndex: number,
	range: SliceRange | null,
	sink: FrameSink | null
): Promise<{ written: number; total: number }> {
	let frameIndex = 1;
	let written = 0;

	const writeFrame = async () => {
		const f = frameIndex;
		frameIndex++;
		progress[sceneIndex].frames = f;
		if (!sink) return;
		if (range && (f < range.start || f > range.end)) return;
		await sink.write(await safeScreenshot(page, args));
		written++;
	};
	const withinRange = () => !range || frameIndex <= range.end;

	const maxFrames = args.fps * 60;
	let guard = 0;

	await writeFrame();

	// enter transition + initial step animation
	while (true) {
		if (isCrashed) throw new Error(`Page crashed during enter of ${id}`);
		if (++guard > maxFrames) throw new Error(`Enter hang on ${id}: >${maxFrames} frames`);
		const { done } = await page.evaluate(
			(delta: number) => window.__sequenceRenderer!.advanceFrame(delta),
			1 / args.fps
		);
		await writeFrame();
		if (done) break;
		if (!withinRange()) break;
	}

	// steps
	guard = 0;
	while (true) {
		if (isCrashed) throw new Error(`Page crashed during steps of ${id}`);
		if (!withinRange()) break;
		const finished = await page.evaluate(() => window.__sequenceRenderer!.manager.finished);
		if (finished) break;
		if (++guard > 200) {
			throw new Error(`Step loop hang on ${id}: too many step invocations`);
		}

		await page.evaluate(() => window.__sequenceRenderer!.manager.next());
		await writeFrame();

		let stepGuard = 0;
		while (true) {
			if (isCrashed) throw new Error(`Page crashed during step animation of ${id}`);
			if (!withinRange()) break;
			if (++stepGuard > maxFrames) {
				throw new Error(`Step animation hang on ${id}: >${maxFrames} frames`);
			}
			const { done } = await page.evaluate(
				(delta: number) => window.__sequenceRenderer!.advanceFrame(delta),
				1 / args.fps
			);
			await writeFrame();
			if (done) break;
		}
	}

	if (isLast) return { written, total: frameIndex - 1 };

	// exit transition
	guard = 0;
	await page.evaluate(() => {
		const d = window.__sequenceRenderer!;
		d.manager.setDirection('forward');
		d.manager.playExit();
	});
	await writeFrame();
	while (true) {
		if (isCrashed) throw new Error(`Page crashed during exit of ${id}`);
		if (!withinRange()) break;
		if (++guard > maxFrames) throw new Error(`Exit hang on ${id}: >${maxFrames} frames`);
		const { done } = await page.evaluate(
			(delta: number) => window.__sequenceRenderer!.advanceFrame(delta),
			1 / args.fps
		);
		await writeFrame();
		if (done) break;
	}
	return { written, total: frameIndex - 1 };
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

/** Encodes each scene's captured frames into its own video file, then cleans up the frame files. */
async function encodeEachScene(ids: string[], args: ResolvedArgs) {
	for (const id of ids) {
		console.log(`Encoding ${id}...`);
		const sceneStart = performance.now();
		await encodeSceneVideo(id, args);
		console.log(
			`Done. Output: ${resolve(sceneOutput(id, args))} (${((performance.now() - sceneStart) / 1000).toFixed(2)}s)`
		);
	}
	if (!args.keepFrames) {
		for (const id of ids) {
			await rm(resolve('rendered/frames', id), { recursive: true, force: true });
		}
		await rm(resolve('rendered', 'frames'), { recursive: true, force: true });
	}
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

/** The scene-level video file a capture (sliced or not) ultimately produces. */
function sceneVideoOut(id: string, perScene: boolean, args: ResolvedArgs): string {
	return perScene ? sceneOutput(id, args) : resolve('rendered', `${id}.mp4`);
}

/** The intermediate mp4 a worker streams one slice of a scene into. */
function sliceSinkPath(id: string, sliceK: number): string {
	return resolve('rendered', 'slices', `${id}.${sliceK}.mp4`);
}

/**
 * Stitches a scene's per-slice videos (all encoded with identical settings) in
 * order into `out` with a stream copy, then removes the slice files.
 */
async function concatSliceVideos(id: string, count: number, out: string) {
	await mkdir(resolve(dirname(out)), { recursive: true });
	const sliceDir = resolve('rendered', 'slices');
	const listPath = resolve('rendered', 'slices-concat.txt');
	const list: string[] = [];
	for (let k = 1; k <= count; k++) {
		list.push(`file '${resolve(sliceDir, `${id}.${k}.mp4`)}'`);
	}
	await writeFile(listPath, list.join('\n'));
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
	for (let k = 1; k <= count; k++) {
		await rm(resolve(sliceDir, `${id}.${k}.mp4`), { force: true });
	}
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
			case '--slices':
				if (argv[i + 1] !== undefined && /^\d+$/.test(argv[i + 1])) {
					const val = parseInt(argv[++i], 10);
					if (val < 1) {
						console.error('--slices requires a positive integer');
						process.exit(1);
					}
					args.slices = val;
				} else {
					args.slices = 4;
				}
				break;
			case '--bench':
				args.bench = true;
				break;
			case '--separate':
				args.separate = true;
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
