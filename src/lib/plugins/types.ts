import type { SceneManager } from '../scene/runtime.svelte';
import type { SceneEntry } from '../scene/sequence';

export interface PluginContext {
	manager: SceneManager;
	sequence: SceneEntry[];
	navigateTo(id: string): Promise<void>;
	next(): void;
	prev(): void;
}

export interface Plugin {
	name: string;
	init?(ctx: PluginContext): void;
	setup?(): void;
	cleanup?(): void;
	onSceneChange?(scene: { id: string; index: number }): void;
	onStepChange?(step: number, total: number): void;
	onKeydown?(event: KeyboardEvent): boolean | void;
}
