import type { SoundCue } from '../audio/index.js';
import type { SceneManager } from './runtime.svelte';
import type { RenderScheduler } from './scheduler';
import type { RenderOptions } from '../options.js';

/**
 * Bridge exposed to the renderer as `window.__sequenceRenderer`. Exists only
 * while a page is loaded with `?render`.
 */
export interface RenderBridge {
	manager: SceneManager;
	scheduler: RenderScheduler;
	scenes: string[];
	sounds: readonly SoundCue[];
	renderOptions: RenderOptions;
	/**
	 * Resolves when the mounted scene is safe to photograph, meaning images
	 * and videos have loaded and a frame has painted. Fonts and the scene
	 * module load even earlier, before the bridge exists.
	 */
	ready: Promise<void>;
	navigateTo: (id: string) => unknown;
	advanceFrame: (deltaSeconds: number) => { done: boolean };
}

declare global {
	interface Window {
		__sequenceRenderer?: RenderBridge;
	}
}

export {};
