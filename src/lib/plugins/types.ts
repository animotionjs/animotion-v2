import type { SceneEntry } from '../scene/runtime/sequence';

/** The parts of a scene manager a plugin may drive. */
export interface PresentationManager {
	/** Moves to a step by index, optionally with the step completed or the scene finished. */
	seek(step: number, completed?: boolean, finished?: boolean): void;
	/** Plays the current step in place. */
	play(): void;
}

/** A snapshot of where the presentation currently is. Read it anytime, since the shell keeps it current. */
export interface PresentationState {
	/** The active scene id. */
	sceneId: string;
	/** The 0-based index of the active scene. */
	sceneIndex: number;
	/** Total number of scenes. */
	totalScenes: number;
	/** The step the user is currently on (0-based), where a completed step counts as the next one. */
	step: number;
	/** Total number of steps in the active scene. */
	totalSteps: number;
	/** Whether the current step's animation has fully played. */
	stepCompleted: boolean;
	/** Whether the current step's animation is playing. */
	playing: boolean;
	/** Whether the active scene has finished all its steps. */
	finished: boolean;
}

/** Environment handed to a plugin, with access to the presentation shell. */
export interface PluginContext {
	/** Reactive snapshot of the current scene and step. */
	state: Readonly<PresentationState>;
	sequence: SceneEntry[];
	/**
	 * The manager of the scene on screen. Read it when it is needed, since a
	 * scene change swaps in a different manager.
	 */
	readonly manager: PresentationManager;
	/**
	 * Moves to `id`. `step` seeds where the scene resumes, for callers that
	 * track a position the scene has not reached yet.
	 */
	navigateTo(id: string, step?: { index: number; completed: boolean }): Promise<void>;
	next(): void;
	prev(): void;
}

/**
 * A presentation plugin. All hooks are optional. `setup` runs at shell mount
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
	/** Runs on every keydown, and returning `true` consumes the event. */
	onKeydown?(event: KeyboardEvent): boolean | void;
}
