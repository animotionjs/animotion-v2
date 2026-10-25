import type { AspectRatio, ResolutionName } from '../scene/options.js';

/** Render quality tiers, matching what the renderer accepts. */
export type EditorQuality = 'full' | 'balanced' | 'preview';

/**
 * Settings the editor owns. Seeded from config when the editor opens, then
 * changed by hand. The preview and the render both read this one object, so
 * what you see is what you get.
 */
export interface EditorSettings {
	aspect: AspectRatio;
	resolution: ResolutionName;
	fps: number;
	quality: EditorQuality;
	output: 'video' | 'images';
}
