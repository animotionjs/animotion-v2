import { createContext } from 'svelte';
import type { SceneManager } from './runtime.svelte';

/**
 * Svelte context for the active {@link SceneManager}. Available only within a
 * component tree rendered by `<Scenes>`; `createScene` relies on it.
 */
export const [getSceneManager, setSceneManager] = createContext<SceneManager>();
/** Svelte context resolving to the current scene id. */
export const [getSceneId, setSceneId] = createContext<() => string>();
