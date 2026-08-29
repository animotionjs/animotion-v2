import type { AspectRatio, ResolutionName } from '../scene/options.js';

export type RenderScope = 'scene' | 'all';
export type RenderQuality = 'full' | 'balanced' | 'preview';
export type RenderOutput = 'video' | 'images';

export interface RenderSettings {
	aspect: AspectRatio;
	resolution: ResolutionName;
	rate: number;
	scope: RenderScope;
	quality: RenderQuality;
	output: RenderOutput;
}
