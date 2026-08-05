import type { SceneManager } from '../scene/runtime/runtime.svelte';
import type { SceneEntry } from '../scene/runtime/sequence';

/** Environment handed to a plugin; provides access to the presentation shell. */
export interface PluginContext {
	manager: SceneManager;
	sequence: SceneEntry[];
	navigateTo(id: string): Promise<void>;
	next(): void;
	prev(): void;
}

/**
 * A presentation plugin. All hooks are optional; `init` runs at registration,
 * `setup`/`cleanup` at shell mount/unmount, and the event hooks as the
 * presentation plays. `onKeydown` returning `true` consumes the key.
 */
export interface Plugin {
	/** Unique plugin name, used for deduplication and lookup. */
	name: string;
	/** Runs once at registration with the plugin context. */
	init?(ctx: PluginContext): void;
	/** Runs when the presentation shell mounts. */
	setup?(): void;
	/** Runs when the presentation shell unmounts. */
	cleanup?(): void;
	/** Runs whenever the active scene changes. */
	onSceneChange?(scene: { id: string; index: number }): void;
	/** Runs whenever the active step index changes. */
	onStepChange?(step: number, total: number): void;
	/** Runs on every keydown; returning `true` consumes the event. */
	onKeydown?(event: KeyboardEvent): boolean | void;
}
