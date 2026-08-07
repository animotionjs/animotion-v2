import { getOptions } from '../../scene/options.js';
import { SPEAKER_CHANNEL, SpeakerChannel } from './channel';
import type { SpeakerMessage, SpeakerScene, SpeakerState } from './channel';
import type { Plugin, PluginContext } from '../types';

export interface SpeakerPluginOptions {
	/** Key that opens the speaker view. Defaults to `s`. */
	shortcut?: string;
	/** `BroadcastChannel` name shared with the speaker view. */
	channel?: string;
}

/**
 * A plugin that broadcasts the presentation state to a speaker view and
 * relays its commands back to the presentation.
 *
 * Open the speaker view by pressing {@link SpeakerPluginOptions.shortcut}
 * (`s` by default) or by calling {@link openSpeakerView}. The speaker view
 * lives at `/speaker` and shows live slide previews, the current scene's
 * notes, a timer, an outline, and next/prev controls.
 */
export function speakerPlugin(options: SpeakerPluginOptions = {}): Plugin {
	const shortcut = options.shortcut ?? 's';
	const channelName = options.channel ?? SPEAKER_CHANNEL;

	let ctx: PluginContext | null = null;
	let channel: SpeakerChannel | null = null;
	let scenes: SpeakerScene[] = [];
	let lastPayload = '';

	function buildState(): SpeakerState {
		const { aspectRatio } = getOptions();
		return {
			sceneId: ctx?.state.sceneId ?? '',
			sceneIndex: ctx?.state.sceneIndex ?? 0,
			totalScenes: ctx?.state.totalScenes ?? scenes.length,
			step: ctx?.state.step ?? 0,
			totalSteps: ctx?.state.totalSteps ?? 0,
			finished: ctx?.state.finished ?? false,
			aspectRatio: { width: aspectRatio.width, height: aspectRatio.height },
			scenes
		};
	}

	/** Broadcasts the current state, skipping it when it hasn't changed. */
	function broadcast(force = false) {
		if (!channel) return;
		const state = buildState();
		const payload = JSON.stringify(state);
		if (!force && payload === lastPayload) return;
		lastPayload = payload;
		channel.post({ type: 'state', state });
	}

	function handleMessage(message: SpeakerMessage) {
		switch (message.type) {
			case 'next':
				ctx?.next();
				break;
			case 'prev':
				ctx?.prev();
				break;
			case 'goto':
				ctx?.navigateTo(message.id);
				break;
			case 'hello':
				// A freshly opened speaker window never received past broadcasts,
				// so send the current state even if nothing changed.
				broadcast(true);
				break;
		}
	}

	return {
		name: 'speaker',

		setup(pluginCtx) {
			channel?.close();
			ctx = pluginCtx;
			scenes = pluginCtx.sequence.map(({ id }) => ({ id }));
			if (typeof BroadcastChannel !== 'undefined') {
				channel = new SpeakerChannel(channelName);
				channel.onmessage = handleMessage;
				broadcast();
			}

			return () => {
				channel?.close();
				channel = null;
				ctx = null;
				scenes = [];
				lastPayload = '';
			};
		},

		onSceneChange() {
			broadcast();
		},

		onStepChange() {
			broadcast();
		},

		onKeydown(event) {
			if (
				event.key !== shortcut ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				event.repeat
			) {
				return;
			}
			openSpeakerView(channelName === SPEAKER_CHANNEL ? undefined : channelName);
			return true;
		}
	};
}

/**
 * Opens the speaker view in a popup window. The window reuses a stable name
 * so repeated calls focus the existing popup instead of stacking new ones.
 */
export function openSpeakerView(channel?: string) {
	if (typeof window === 'undefined') return;
	const path = channel ? `/speaker?channel=${encodeURIComponent(channel)}` : '/speaker';
	window.open(path, 'animotion-speaker', 'popup,width=1360,height=860');
}
