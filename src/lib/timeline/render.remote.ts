import { error } from '@sveltejs/kit';
import { command, query } from '$app/server';
import {
	cancelRender as cancelRunningRender,
	openRenderedFolder,
	renderSnapshot,
	startRender as startRenderer
} from '#lib/server/render-runner.js';
import { ASPECT_RATIOS, RESOLUTIONS } from '#lib/scene/options.js';
import type { AspectRatio, ResolutionName } from '#lib/scene/options.js';
import type { QualityTier, RenderSnapshot } from '#lib/server/render-runner.js';

const RATES = [30, 60];
const OUTPUTS = ['video', 'images'] as const;
const QUALITIES = ['full', 'balanced', 'preview'] as const;

function isAspectRatio(value: unknown): value is AspectRatio {
	return typeof value === 'string' && value in ASPECT_RATIOS;
}

function isResolution(value: unknown): value is ResolutionName {
	return typeof value === 'string' && value in RESOLUTIONS;
}

function isQuality(value: unknown): value is QualityTier {
	return typeof value === 'string' && (QUALITIES as readonly string[]).includes(value);
}

function isOutput(value: unknown): value is 'video' | 'images' {
	return typeof value === 'string' && (OUTPUTS as readonly string[]).includes(value);
}

/** Whitelist validation for the render settings coming from the browser. */
function parseRequest(input: unknown) {
	if (typeof input !== 'object' || input === null) error(400, 'Invalid render request');
	const { scene, aspect, resolution, fps, quality, output, origin } = input as Record<
		string,
		unknown
	>;
	if (scene !== null && typeof scene !== 'string') error(400, 'Invalid scene');
	if (!isAspectRatio(aspect)) error(400, 'Unknown aspect ratio');
	if (!isResolution(resolution)) error(400, 'Unknown resolution');
	if (typeof fps !== 'number' || !RATES.includes(fps)) error(400, 'Unsupported frame rate');
	if (!isQuality(quality)) error(400, 'Unknown quality');
	if (!isOutput(output)) error(400, 'Unknown output');
	/*
	 * The renderer attaches to the dev server the page came from, so only
	 * local origins are accepted.
	 */
	if (
		typeof origin !== 'string' ||
		!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)
	) {
		error(400, 'Invalid dev server origin');
	}
	return { scene, aspect, resolution, fps, quality, output, origin };
}

export type RenderStatus = ReturnType<typeof renderStatus>;

export const startRender = command('unchecked', async (input) => {
	await startRenderer(parseRequest(input));
});

export const cancelRender = command(async () => {
	cancelRunningRender();
});

export const openRenderFolder = command(async () => {
	await openRenderedFolder();
});

export const renderStatus = query.live(async function* () {
	let last = '';
	let opened = false;
	let stale = false;
	while (true) {
		const snapshot = renderSnapshot();
		const settled = snapshot.phase === 'done' || snapshot.phase === 'failed';
		/*
		 * A finished render is old news once the page reloads, so a stream
		 * that opens on a settled phase hides it until a new render changes
		 * the state for real.
		 */
		if (!opened) {
			opened = true;
			stale = settled;
		} else if (!settled) {
			stale = false;
		}
		const view: RenderSnapshot = stale
			? { phase: 'idle', percent: 0, output: null, error: null, duration: null }
			: snapshot;
		const key = JSON.stringify(view);
		if (key !== last) {
			last = key;
			yield view;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
});
