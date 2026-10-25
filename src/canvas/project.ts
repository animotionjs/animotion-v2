import type { SceneDefinition, SceneTimeline } from './scene.js';

export interface ProjectSize {
	width: number;
	height: number;
}

export interface ProjectDefinition {
	readonly id: string;
	readonly size: ProjectSize;
	readonly background: string;
	readonly scenes: readonly SceneDefinition[];
}

export function defineProject(project: ProjectDefinition): ProjectDefinition {
	return project;
}

export function projectTimelines(project: ProjectDefinition): SceneTimeline[] {
	return project.scenes.map((scene) => scene.timeline());
}

export function projectDuration(project: ProjectDefinition): number {
	return projectTimelines(project).reduce((total, timeline) => total + timeline.totalDuration, 0);
}

export function sceneStarts(project: ProjectDefinition): number[] {
	const starts: number[] = [];
	let cursor = 0;
	for (const scene of project.scenes) {
		starts.push(cursor);
		cursor += scene.timeline().totalDuration;
	}
	return starts;
}

export function sceneAtTime(
	project: ProjectDefinition,
	time: number
): { index: number; localTime: number } {
	const starts = sceneStarts(project);
	let index = 0;
	for (let i = 0; i < starts.length; i++) {
		if (time >= starts[i]!) index = i;
	}
	return { index, localTime: Math.max(0, time - (starts[index] ?? 0)) };
}
