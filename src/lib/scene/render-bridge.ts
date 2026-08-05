import type { SceneManager } from './runtime.svelte';
import type { RenderScheduler } from './scheduler';
import type { RenderOptions } from './options.js';

export interface RenderBridge {
	manager: SceneManager;
	scheduler: RenderScheduler;
	scenes: string[];
	renderOptions: RenderOptions;
	navigateTo: (id: string) => unknown;
	advanceFrame: (deltaSeconds: number) => { done: boolean };
}

declare global {
	interface Window {
		__sequenceRenderer?: RenderBridge;
	}
}

export {};
