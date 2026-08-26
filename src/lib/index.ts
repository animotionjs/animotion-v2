export { createSequence } from './scene/runtime/sequence.js';
export { configure, registerLanguages, highlight, whenReady } from './scene/code/highlighter.js';
export { getOptions, setOptions } from './scene/options.js';
export { TransitionBuilder, SceneManager } from './scene/runtime/runtime.svelte.js';
export {
	PluginManager,
	fullscreenPlugin,
	speakerPlugin,
	openSpeakerView,
	SpeakerView,
	SPEAKER_SESSION
} from './plugins/index.js';
export {
	getSceneManager,
	setSceneManager,
	getSceneId,
	setSceneId
} from './scene/runtime/context.svelte.js';
export { TickStep } from './scene/runtime/steps.js';
export { default as Scene } from './components/Scene.svelte';
export { default as Scenes } from './components/Scenes.svelte';
export * from './timeline/index.js';
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
	type SceneBuilder,
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
export {
	Camera,
	CameraStep,
	frameCenter,
	type CameraOptions,
	type CameraTarget
} from './scene/camera/index.js';

export type { Direction, TransitionBuild } from './scene/runtime/runtime.svelte.js';
export type { SceneEntry, Sequence } from './scene/runtime/sequence.js';
export type { TickFrame } from './scene/runtime/steps.js';
export type {
	Plugin,
	PluginContext,
	PresentationState,
	StepChangeSubscribe
} from './plugins/index.js';
export type { SpeakerPluginOptions } from './plugins/index.js';
export type {
	SpeakerState,
	SpeakerScene,
	SpeakerMessage,
	SpeakerCommand
} from './plugins/index.js';
export type { RenderBridge } from './scene/runtime/render-bridge.js';
export type { Token, PositionedToken, MorphToken } from './scene/code/highlighter.js';
export type {
	Options,
	AspectRatio,
	ResolutionName,
	RenderOptions,
	RenderOptionsInput
} from './scene/options.js';
export type { Easing } from './scene/easing.js';
