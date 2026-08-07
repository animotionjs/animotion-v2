import type { SceneEntry } from '../scene/runtime/sequence';

/** A snapshot of where the presentation currently is. Read it anytime; the shell keeps it current. */
export interface PresentationState {
	/** The active scene id. */
	sceneId: string;
	/** The 0-based index of the active scene. */
	sceneIndex: number;
	/** Total number of scenes. */
	totalScenes: number;
	/** The 0-based index of the current step. */
	step: number;
	/** Total number of steps in the active scene. */
	totalSteps: number;
	/** Whether the current step's animation has fully played. */
	stepCompleted: boolean;
	/** Whether the active scene has finished all its steps. */
	finished: boolean;
}

/** Environment handed to a plugin; provides access to the presentation shell. */
export interface PluginContext {
	/** Reactive snapshot of the current scene and step. */
	state: Readonly<PresentationState>;
	sequence: SceneEntry[];
	navigateTo(id: string): Promise<void>;
	next(): void;
	prev(): void;
}

/**
 * A presentation plugin. All hooks are optional; `setup` runs at shell mount
 * and may return cleanup logic, while the event hooks run as the presentation plays.
 * `onKeydown` returning `true` consumes the key.
 */
export interface Plugin {
	/** Unique plugin name, used for deduplication and lookup. */
	name: string;
	/** Runs when the presentation shell mounts (or immediately if registered after). May return cleanup logic. */
	setup?(ctx: PluginContext): void | (() => void);
	/** Runs whenever the active scene changes. */
	onSceneChange?(scene: { id: string; index: number }): void;
	/** Runs whenever the active step index changes. */
	onStepChange?(step: number, total: number): void;
	/** Runs on every keydown; returning `true` consumes the event. */
	onKeydown?(event: KeyboardEvent): boolean | void;
}
