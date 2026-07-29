import type { SceneManager } from './runtime.svelte';
import type { RenderScheduler } from './scheduler';

export interface RenderBridge {
	manager: SceneManager;
	scheduler: RenderScheduler;
	slides: string[];
	navigateTo: (slug: string) => unknown;
	advanceFrame: (deltaSeconds: number) => { done: boolean };
}

declare global {
	interface Window {
		__deckRenderer?: RenderBridge;
	}
}

export {};
