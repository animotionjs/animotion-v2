import type { SceneManager } from './runtime.svelte';
import type { RenderScheduler } from './scheduler';

export interface RenderBridge {
	manager: SceneManager;
	scheduler: RenderScheduler;
	scenes: string[];
	navigateTo: (id: string) => unknown;
	advanceFrame: (deltaSeconds: number) => { done: boolean };
}

declare global {
	interface Window {
		__sequenceRenderer?: RenderBridge;
	}
}

export {};
