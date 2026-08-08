import { getOptions } from '../../scene/options.js';
import { getSceneManager } from '../../scene/runtime/context.svelte.js';
import { SPEAKER_CHANNEL, SpeakerChannel } from './channel';
import type { SpeakerMessage, SpeakerScene, SpeakerState } from './channel';
import type { Plugin, PluginContext } from '../types';

export interface SpeakerPluginOptions {
	/** Key that opens the speaker view. Defaults to `s`. */
	shortcut?: string;
	/** `BroadcastChannel` name shared with the speaker view. */
	channel?: string;
	/**
	 * Run the plugin as an embedded mirror of the presentation instead of as
	 * the authoritative presenter. The mirror listens for state broadcasts,
	 * seeking its own scene/step in place, and never broadcasts or opens the
	 * speaker view. Used to render a live preview in the speaker window.
	 */
	embed?: boolean;
}

/**
 * A plugin that broadcasts the presentation state to a speaker view and
 * relays its commands back to the presentation.
 *
 * Open the speaker view by pressing {@link SpeakerPluginOptions.shortcut}
 * (`s` by default) or by calling {@link openSpeakerView}. The speaker view
 * lives at `/speaker` and shows the presentation mirrored in an iframe
 * (registered with `embed: true`), the current scene's notes, a timer, an
 * outline, and next/prev controls.
 */
export function speakerPlugin(options: SpeakerPluginOptions = {}): Plugin {
	const shortcut = options.shortcut ?? 's';
	const channelName = options.channel ?? SPEAKER_CHANNEL;
	const embed = options.embed ?? false;

	let ctx: PluginContext | null = null;
	let channel: SpeakerChannel | null = null;
	let scenes: SpeakerScene[] = [];
	let lastPayload = '';
	let pendingSceneId = '';
	let manager: ReturnType<typeof getSceneManager> | null = null;

	function buildState(): SpeakerState {
		const { aspectRatio } = getOptions();
		return {
			sceneId: ctx?.state.sceneId ?? '',
			sceneIndex: ctx?.state.sceneIndex ?? 0,
			totalScenes: ctx?.state.totalScenes ?? scenes.length,
			step: ctx?.state.step ?? 0,
			totalSteps: ctx?.state.totalSteps ?? 0,
			stepCompleted: ctx?.state.stepCompleted ?? false,
			finished: ctx?.state.finished ?? false,
			aspectRatio: { width: aspectRatio.width, height: aspectRatio.height },
			scenes,
			// The presentation window renders the active scene, so its own
			// hidden `[data-notes]` box holds the current scene's notes.
			notes:
				typeof document !== 'undefined'
					? (document.querySelector('[data-notes]')?.innerHTML ?? '')
					: ''
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
		if (embed) {
			// The mirror is passive: it only adopts `state` broadcasts and never
			// reacts to commands (next/prev/goto) or re-broadcasts, so the shared
			// channel isn't polluted by its replies and its own commander.
			if (message.type === 'state') embedState(message.state);
			return;
		}
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
			case 'state':
				break;
		}
	}

	/**
	 * Adopts a presenter's broadcast state in place. Moving to a different
	 * scene navigates (the scene fast-forwards to the target step via its
	 * pre-seeded state); moving within the current scene seeks the loaded
	 * manager directly, so step changes never replay the entrance.
	 */
	function embedState(state: SpeakerState) {
		if (!ctx) return;
		if (ctx.state.sceneId !== state.sceneId) {
			// Seed the target scene so the navigation fast-forwards to the
			// broadcast step, then navigate once per distinct target scene to
			// avoid re-running the switch while it is still in flight.
			if (state.sceneId !== pendingSceneId) {
				pendingSceneId = state.sceneId;
				manager?.setStepState(state.sceneId, state.step, state.stepCompleted);
				void ctx.navigateTo(state.sceneId);
			}
		} else {
			pendingSceneId = '';
			const same =
				state.step === ctx.state.step &&
				state.stepCompleted === ctx.state.stepCompleted &&
				state.finished === ctx.state.finished;
			if (!same) {
				manager?.seek(state.step, state.stepCompleted, state.finished);
			}
		}
	}

	return {
		name: embed ? 'speaker-embed' : 'speaker',

		setup(pluginCtx) {
			channel?.close();
			ctx = pluginCtx;
			scenes = pluginCtx.sequence.map(({ id }) => ({ id }));
			if (embed) manager = getSceneManager();
			if (typeof BroadcastChannel !== 'undefined') {
				channel = new SpeakerChannel(channelName);
				channel.onmessage = handleMessage;
				if (embed) {
					// Ask the presenter for its current state to mirror it.
					channel.post({ type: 'hello' });
				} else {
					broadcast();
				}
			}

			return () => {
				channel?.close();
				channel = null;
				ctx = null;
				scenes = [];
				lastPayload = '';
				pendingSceneId = '';
			};
		},

		onSceneChange() {
			if (!embed) broadcast();
		},

		onStepChange() {
			if (!embed) broadcast();
		},

		onKeydown(event) {
			if (embed) {
				// The mirror never navigates itself. Forward arrows to the
				// presenter so keyboard input (focus often lives inside the
				// embedded iframe) still drives the authoritative window the
				// same as the speaker's buttons.
				if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
				if (event.key === 'ArrowRight') {
					channel?.post({ type: 'next' });
					return true;
				}
				if (event.key === 'ArrowLeft') {
					channel?.post({ type: 'prev' });
					return true;
				}
				return;
			}
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
