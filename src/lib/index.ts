export type { Direction, TransitionBuild } from './scene/runtime.svelte.js';
export { createSequence } from './scene/sequence.js';
export type { SceneEntry, Sequence } from './scene/sequence.js';
export type { TickFrame } from './scene/steps.js';
export type { Plugin, PluginContext } from './plugins/types.js';
export type { RenderBridge } from './scene/render-bridge.js';

export { configure, registerLanguages, highlight, whenReady } from './scene/highlighter.js';
export type { Token, PositionedToken, MorphToken } from './scene/highlighter.js';
export { getOptions, setOptions } from './scene/options.js';
export type {
	Options,
	AspectRatio,
	ResolutionName,
	RenderOptions,
	RenderOptionsInput
} from './scene/options.js';
export { TransitionBuilder, SceneManager } from './scene/runtime.svelte.js';
export { PluginManager } from './plugins/manager.svelte.js';
export { fullscreenPlugin } from './plugins/fullscreen.js';
export {
	getSceneManager,
	setSceneManager,
	getSceneId,
	setSceneId
} from './scene/context.svelte.js';
export { TickStep } from './scene/steps.js';
export { default as Scene } from './components/Scene.svelte';
export { default as Scenes } from './components/Scenes.svelte';
export type { Easing } from './scene/easing.js';
export {
	clamp,
	lerp,
	clampRemap,
	linear,
	easeInQuad,
	easeOutQuad,
	easeInOutQuad,
	easeInCubic,
	easeOutCubic,
	easeInOutCubic,
	easeInQuart,
	easeOutQuart,
	easeInOutQuart,
	easeInQuint,
	easeOutQuint,
	easeInOutQuint,
	easeInSine,
	easeOutSine,
	easeInOutSine,
	easeInExpo,
	easeOutExpo,
	easeInOutExpo,
	easeInCirc,
	easeOutCirc,
	easeInOutCirc,
	easeInBack,
	easeOutBack,
	easeInOutBack,
	easeInElastic,
	easeOutElastic,
	easeInOutElastic,
	easeInBounce,
	easeOutBounce,
	easeInOutBounce,
	easeInOut,
	easeOut
} from './scene/easing.js';
export {
	createScene,
	Code,
	insert,
	remove,
	replace,
	word,
	lines,
	range,
	position,
	FIRST,
	ALL,
	LAST,
	DEFAULT,
	ALL_LINES,
	smartIndent,
	code,
	getCodeState
} from './scene/index.js';
