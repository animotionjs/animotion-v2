import type { Component } from 'svelte';

export interface SceneEntry {
	id: string;
	order: number;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a scene may be any component
	component: () => Promise<{ default: Component<any> }>;
}

export type Sequence = SceneEntry[];
