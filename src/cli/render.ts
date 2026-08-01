#!/usr/bin/env node
import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { chromium, type Browser, type Page } from 'playwright';
import ffmpeg from 'ffmpeg-static';
import type { RenderBridge } from '../lib/scene/render-bridge.js';

declare global {
	interface Window {
		__deckRenderer?: RenderBridge;
	}
}

type RenderArgs = {
	out: string;
	fps: number;
	width: number;
	height: number;
	jobs: number;
	framesOnly: boolean;
	keepFrames: boolean;
	progressBar: boolean;
};

const args = parseArgs(process.argv.slice(2));
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

async function main() {
	if (process.argv.includes('--help') || process.argv.includes('-h')) {
		console.log(`animotion render

Record a presentation into a video.

Options:
  --out <path>       output video file (default: rendered/video.mp4)
  --fps <number>     frames per second (default: 60)
  --width <number>   video width (default: 1920)
  --height <number>  video height (default: 1080)
  --jobs <number>    parallel render workers (default: 4)
  --frames-only      save frames without encoding video
  --keep-frames      keep rendered frames after encoding
  --progress-bar     show a progress bar
`);
		process.exit(0);
	}

	const renderStart = performance.now();
	const renderQs = args.progressBar ? 'render=video&progress=1' : 'render=video';
	console.log('Starting dev server...');
	server = spawn(
		resolve('node_modules/.bin/vite'),
		['dev', '--port', '4173', '--host', '127.0.0.1'],
		{
			stdio: ['ignore', 'ignore', 'inherit']
		}
	);
	server.on('error', (err) => {
		console.error('Failed to start vite:', err.message);
		process.exit(1);
	});

	try {
		await waitForServer('http://127.0.0.1:4173');
	} catch (e) {
		server.kill();
		throw e;
	}

	console.log('Dev server ready on http://127.0.0.1:4173');

	console.log('Launching browser...');
	browser = await chromium.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
	});

	const tempPage = await browser.newPage({
		viewport: { width: args.width, height: args.height },
		deviceScaleFactor: 1
	});
	tempPage.on('crash', () => {
		isCrashed = true;
	});
	await tempPage.goto(`http://127.0.0.1:4173/?${renderQs}`, { waitUntil: 'domcontentloaded' });
	await tempPage.waitForFunction(() => window.__deckRenderer !== undefined);
	const scenes: string[] = await tempPage.evaluate(() => window.__deckRenderer!.scenes);
	await tempPage.close();

	console.log(`Rendering ${scenes.length} scenes with ${args.jobs} workers...`);

	progress.length = 0;
	for (const id of scenes) progress.push({ id, frames: 0, done: false, startMs: 0, finalMs: 0 });

	let nextIndex = 0;
	function popScene(): string | null {
		const i = nextIndex;
		if (i >= scenes.length) return null;
		nextIndex = i + 1;
		return scenes[i];
	}

	for (let i = 0; i < scenes.length; i++) process.stdout.write('\n');
	statusTimer = setInterval(printStatus, 200);

	const workers: Promise<void>[] = [];
	for (let w = 0; w < args.jobs; w++) {
		workers.push(runWorker(browser!, args, scenes, popScene, renderQs));
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
	console.log(
		`Captured ${scenes.length} scenes, ${totalFrames} frames in ${captureElapsed.toFixed(2)}s`
	);

	if (!args.framesOnly) {
		console.log('Encoding final video...');
		await mkdir(resolve(dirname(args.out)), { recursive: true });
		const encodeStart = performance.now();
		await encodeFinalVideo(scenes, args);
		const encodeElapsed = (performance.now() - encodeStart) / 1000;
		console.log('Done. Output:', resolve(args.out));
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

async function runWorker(
	b: Browser,
	args: RenderArgs,
	scenes: string[],
	popScene: () => string | null,
	renderQs: string
): Promise<void> {
	const page = await b.newPage({
		viewport: { width: args.width, height: args.height },
		deviceScaleFactor: 1
	});

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

			const sceneIndex = scenes.indexOf(id);
			const isLast = id === scenes[scenes.length - 1];

			await page.goto(`http://127.0.0.1:4173/${id}?${renderQs}`, {
				waitUntil: 'domcontentloaded',
				timeout: 10000
			});
			await page.waitForFunction(() => window.__deckRenderer !== undefined);

			progress[sceneIndex].startMs = performance.now();
			const frames = await captureScene(page, id, isLast, args, sceneIndex);
			const ms = performance.now() - progress[sceneIndex].startMs;
			progress[sceneIndex].done = true;
			progress[sceneIndex].finalMs = ms;
			sceneStats.push({ id, frames, ms });
		}
	} finally {
		await page.close().catch(() => {});
	}
}

async function captureScene(
	page: Page,
	id: string,
	isLast: boolean,
	args: RenderArgs,
	sceneIndex: number
): Promise<number> {
	const frameDir = resolve('rendered/frames', id);
	await mkdir(frameDir, { recursive: true });

	let frameIndex = 1;
	const writeFrame = async (buf: Buffer) => {
		const path = join(frameDir, `frame_${String(frameIndex).padStart(6, '0')}.png`);
		progress[sceneIndex].frames = frameIndex;
		await writeFile(path, buf);
		frameIndex++;
	};

	const maxFrames = args.fps * 60;
	let guard = 0;

	await writeFrame(await safeScreenshot(page));

	// enter transition + initial step animation
	while (true) {
		if (isCrashed) throw new Error(`Page crashed during enter of ${id}`);
		if (++guard > maxFrames) throw new Error(`Enter hang on ${id}: >${maxFrames} frames`);
		const { done } = await page.evaluate(
			(delta: number) => window.__deckRenderer!.advanceFrame(delta),
			1 / args.fps
		);
		await writeFrame(await safeScreenshot(page));
		if (done) break;
	}

	// steps
	guard = 0;
	while (true) {
		if (isCrashed) throw new Error(`Page crashed during steps of ${id}`);
		const finished = await page.evaluate(() => window.__deckRenderer!.manager.finished);
		if (finished) break;
		if (++guard > 200) {
			throw new Error(`Step loop hang on ${id}: too many step invocations`);
		}

		await page.evaluate(() => window.__deckRenderer!.manager.next());
		await writeFrame(await safeScreenshot(page));

		let stepGuard = 0;
		while (true) {
			if (isCrashed) throw new Error(`Page crashed during step animation of ${id}`);
			if (++stepGuard > maxFrames) {
				throw new Error(`Step animation hang on ${id}: >${maxFrames} frames`);
			}
			const { done } = await page.evaluate(
				(delta: number) => window.__deckRenderer!.advanceFrame(delta),
				1 / args.fps
			);
			await writeFrame(await safeScreenshot(page));
			if (done) break;
		}
	}

	if (isLast) return frameIndex - 1;

	// exit transition
	guard = 0;
	await page.evaluate(() => {
		const d = window.__deckRenderer!;
		d.manager.setDirection('forward');
		d.manager.playExit();
	});
	await writeFrame(await safeScreenshot(page));
	while (true) {
		if (isCrashed) throw new Error(`Page crashed during exit of ${id}`);
		if (++guard > maxFrames) throw new Error(`Exit hang on ${id}: >${maxFrames} frames`);
		const { done } = await page.evaluate(
			(delta: number) => window.__deckRenderer!.advanceFrame(delta),
			1 / args.fps
		);
		await writeFrame(await safeScreenshot(page));
		if (done) break;
	}
	return frameIndex - 1;
}

async function encodeFinalVideo(slugs: string[], args: RenderArgs) {
	const inputs: string[] = [];
	for (const id of slugs) {
		inputs.push(
			'-framerate',
			String(args.fps),
			'-i',
			join('rendered/frames', id, 'frame_%06d.png')
		);
	}

	const filter = `concat=n=${slugs.length}:v=1:a=0[outv]`;

	await new Promise<void>((resolve, reject) => {
		const ff = spawn(ffmpeg!, [
			'-y',
			'-loglevel',
			'error',
			...inputs,
			'-filter_complex',
			filter,
			'-map',
			'[outv]',
			'-c:v',
			'libx264',
			'-pix_fmt',
			'yuv420p',
			'-crf',
			'18',
			'-fps_mode',
			'cfr',
			'-movflags',
			'+faststart',
			args.out
		]) as ChildProcessWithoutNullStreams;
		ff.stderr.on('data', (d: Buffer) => process.stderr.write(d));

		ff.on('error', (err) => reject(new Error(`ffmpeg error: ${err.message}`)));
		ff.on('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`ffmpeg exited with code ${code}`));
		});
	});

	if (!args.keepFrames) {
		for (const id of slugs) {
			await rm(resolve('rendered/frames', id), { recursive: true, force: true });
		}
		await rm(resolve('rendered', 'frames'), { recursive: true, force: true });
	}
}

function cleanup() {
	if (browser) browser.close().catch(() => {});
	if (server) server.kill();
}

async function safeScreenshot(page: Page, retries = 3): Promise<Buffer> {
	if (isCrashed) throw new Error('Page has crashed, aborting');
	for (let attempt = 0; attempt < retries; attempt++) {
		try {
			return await page.screenshot({ type: 'png' });
		} catch (err) {
			if (attempt === retries - 1) throw err;
			console.warn(`Screenshot failed (attempt ${attempt + 1}/${retries}), retrying...`);
			await new Promise((r) => setTimeout(r, 1000));
		}
	}
	throw new Error('unreachable');
}

function parseArgs(argv: string[]): RenderArgs {
	const args: RenderArgs = {
		out: 'rendered/video.mp4',
		fps: 60,
		width: 1920,
		height: 1080,
		jobs: 4,
		framesOnly: false,
		keepFrames: false,
		progressBar: false
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
		}
	}
	return args;
}

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
