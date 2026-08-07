export { PluginManager } from './manager.svelte';
export type { StepChangeSubscribe } from './manager.svelte';
export { fullscreenPlugin } from './fullscreen.js';
export { speakerPlugin, openSpeakerView } from './speaker/speaker.js';
export type { SpeakerPluginOptions } from './speaker/speaker.js';
export { SPEAKER_CHANNEL } from './speaker/channel.js';
export type {
	SpeakerState,
	SpeakerScene,
	SpeakerMessage,
	SpeakerCommand
} from './speaker/channel.js';
export { default as SpeakerView } from './speaker/SpeakerView.svelte';
export type { Plugin, PluginContext, PresentationState } from './types';
