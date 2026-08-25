import type { Easing } from './easing.js';

/** Named slide shapes. `video` is 16:9 landscape, `vertical` is 9:16 portrait, `square` is 1:1. */
export const ASPECT_RATIOS = {
	video: { width: 1920, height: 1080 },
	vertical: { width: 1080, height: 1920 },
	square: { width: 1080, height: 1080 }
} as const;

export type AspectRatio = keyof typeof ASPECT_RATIOS;

/** Render size tiers, applied to the shape's smaller side. */
const RESOLUTIONS = {
	'720p': 720,
	'1080p': 1080,
	'2k': 1440,
	'4k': 2160
} as const;

export type ResolutionName = keyof typeof RESOLUTIONS;

/** Frame image format captured from the page. */
export type FrameFormat = 'png' | 'jpeg';

/** Fully resolved render settings; every field has a concrete value. */
export interface RenderOptions {
	fps: number;
	width: number;
	height: number;
	/** Worker count, or `'auto'` to let the renderer pick from the CPU core count. */
	jobs: number | 'auto';
	out: string;
	framesOnly: boolean;
	keepFrames: boolean;
	progressBar: boolean;
	format: FrameFormat;
	jpegQuality: number;
}

/**
 * Partial render settings. `resolution` picks a size tier; explicit
 * `width`/`height` override it. Unset fields fall back to defaults.
 */
export interface RenderOptionsInput {
	fps?: number;
	resolution?: ResolutionName;
	width?: number;
	height?: number;
	/** Worker count, or `'auto'` to let the renderer pick from the CPU core count. */
	jobs?: number | 'auto';
	out?: string;
	framesOnly?: boolean;
	keepFrames?: boolean;
	progressBar?: boolean;
	format?: FrameFormat;
	jpegQuality?: number;
}

/** A resolved aspect ratio, the preset name plus its pixel dimensions. */
export interface AspectRatioEntry {
	name: AspectRatio;
	width: number;
	height: number;
}

export type TransitionPreset = 'slide' | 'fade' | 'zoom';

/**
 * Config for the presentation-wide default transition, set via
 * `configure({ transition })`. Only the fields relevant to `type` are used.
 */
export interface TransitionConfig {
	/** Which transition style to use. */
	type: TransitionPreset;
	/** Transition duration in seconds. Defaults to `0.5`. */
	duration?: number;
	/** Easing applied to the transition. Defaults to `easeInOut`. */
	ease?: Easing;
	/** Slide distance in px (slide only). Defaults to `100`. */
	distance?: number;
	/** Starting scale factor (zoom only). Defaults to `0.5`. */
	scale?: number;
}

/** Resolved presentation-wide settings. */
export interface Options {
	aspectRatio: AspectRatioEntry;
	render: RenderOptions;
	transition: TransitionConfig | null;
}

type RenderDefaults = Omit<RenderOptions, 'width' | 'height'>;

const DEFAULT_RENDER: RenderDefaults = {
	fps: 60,
	jobs: 'auto',
	out: 'rendered/video.mp4',
	framesOnly: false,
	keepFrames: false,
	progressBar: false,
	format: 'png',
	jpegQuality: 95
};

const DEFAULT_ASPECT_RATIO: AspectRatio = 'video';

let aspectRatio: AspectRatio = DEFAULT_ASPECT_RATIO;
let render: RenderOptionsInput = {};
let transition: TransitionConfig | null = null;

/**
 * Sets global render options. Each provided field overrides the previous
 * value; omitted fields are left unchanged.
 */
export function setOptions(input: {
	aspectRatio?: AspectRatio;
	render?: RenderOptionsInput;
	transition?: TransitionConfig | null;
}) {
	if (input.aspectRatio) aspectRatio = input.aspectRatio;
	if (input.render) render = { ...input.render };
	if (input.transition) transition = input.transition;
	if (input.transition === null) transition = null;
}

function resolveResolution(preset: { width: number; height: number }): {
	width: number;
	height: number;
} {
	const { width: pw, height: ph } = preset;
	const { width, height, resolution } = render;

	if (width && height) return { width, height };
	if (width) return { width, height: Math.round((width * ph) / pw) };
	if (height) return { width: Math.round((height * pw) / ph), height };

	const tier = resolution ? RESOLUTIONS[resolution] : null;
	if (tier) {
		if (pw <= ph) return { width: tier, height: Math.round((tier * ph) / pw) };
		return { width: Math.round((tier * pw) / ph), height: tier };
	}

	return { width: preset.width, height: preset.height };
}

/**
 * Returns the resolved global options, applying configured overrides to the
 * aspect-ratio preset and filling unset render fields with defaults.
 */
export function getOptions(): Options {
	const preset = ASPECT_RATIOS[aspectRatio];
	const { width, height } = resolveResolution(preset);

	const resolved: RenderOptions = {
		fps: render.fps ?? DEFAULT_RENDER.fps,
		width,
		height,
		jobs: render.jobs ?? DEFAULT_RENDER.jobs,
		out: render.out ?? DEFAULT_RENDER.out,
		framesOnly: render.framesOnly ?? DEFAULT_RENDER.framesOnly,
		keepFrames: render.keepFrames ?? DEFAULT_RENDER.keepFrames,
		progressBar: render.progressBar ?? DEFAULT_RENDER.progressBar,
		format: render.format ?? DEFAULT_RENDER.format,
		jpegQuality: render.jpegQuality ?? DEFAULT_RENDER.jpegQuality
	};

	return {
		aspectRatio: { name: aspectRatio, ...preset },
		render: resolved,
		transition
	};
}
