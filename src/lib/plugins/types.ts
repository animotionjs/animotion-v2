import type { SceneManager } from '#lib/scene/runtime.svelte';
import type { deck } from '#lib/slides/config';

export interface PluginContext {
	manager: SceneManager;
	deck: typeof deck;
	navigateTo(slug: string): Promise<void>;
	next(): void;
	prev(): void;
}

export interface Plugin {
	name: string;
	init?(ctx: PluginContext): void;
	setup?(): void;
	cleanup?(): void;
	onSlideChange?(slide: { slug: string; index: number }): void;
	onStepChange?(step: number, total: number): void;
	onKeydown?(event: KeyboardEvent): boolean | void;
}
