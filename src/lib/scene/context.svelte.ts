import { createContext } from 'svelte';
import type { SceneManager } from './runtime.svelte';

export const [getSceneManager, setSceneManager] = createContext<SceneManager>();
export const [getSceneId, setSceneId] = createContext<() => string>();
