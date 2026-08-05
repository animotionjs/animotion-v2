export const ASPECT_RATIOS = {
	video: { width: 1920, height: 1080 },
	vertical: { width: 1080, height: 1920 },
	square: { width: 1080, height: 1080 }
} as const;

export type AspectRatio = keyof typeof ASPECT_RATIOS;

const RESOLUTIONS = {
	'720p': 720,
	'1080p': 1080,
	'4k': 2160
} as const;

export type ResolutionName = keyof typeof RESOLUTIONS;

export interface RenderOptions {
	fps: number;
	width: number;
	height: number;
	jobs: number;
	out: string;
	framesOnly: boolean;
	keepFrames: boolean;
	progressBar: boolean;
}

export interface RenderOptionsInput {
	fps?: number;
	resolution?: ResolutionName;
	width?: number;
	height?: number;
	jobs?: number;
	out?: string;
	framesOnly?: boolean;
	keepFrames?: boolean;
	progressBar?: boolean;
}

export interface AspectRatioEntry {
	name: AspectRatio;
	width: number;
	height: number;
}

export interface Options {
	aspectRatio: AspectRatioEntry;
	render: RenderOptions;
}

type RenderDefaults = Omit<RenderOptions, 'width' | 'height'>;

const DEFAULT_RENDER: RenderDefaults = {
	fps: 60,
	jobs: 4,
	out: 'rendered/video.mp4',
	framesOnly: false,
	keepFrames: false,
	progressBar: false
};

const DEFAULT_ASPECT_RATIO: AspectRatio = 'video';

let aspectRatio: AspectRatio = DEFAULT_ASPECT_RATIO;
let render: RenderOptionsInput = {};

export function setOptions(input: { aspectRatio?: AspectRatio; render?: RenderOptionsInput }) {
	if (input.aspectRatio) aspectRatio = input.aspectRatio;
	if (input.render) render = { ...input.render };
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
		progressBar: render.progressBar ?? DEFAULT_RENDER.progressBar
	};

	return {
		aspectRatio: { name: aspectRatio, ...preset },
		render: resolved
	};
}
