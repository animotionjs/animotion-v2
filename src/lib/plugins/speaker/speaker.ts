import { getOptions } from '../../scene/options.js';
import { getSceneManager } from '../../scene/runtime/context.svelte.js';
import {
	SPEAKER_SESSION,
	SpeakerSession,
	type SpeakerMessage,
	type SpeakerScene,
	type SpeakerState
} from './session';
import type { Plugin, PluginContext } from '../types';

export interface SpeakerPluginOptions {
	/** Key that opens the speaker view. Defaults to `s`. */
	shortcut?: string;
	/**
	 * Speaker session id shared with the speaker view; all windows of one
	 * presentation use the same id. Defaults to {@link SPEAKER_SESSION}.
	 */
	session?: string;
}

/**
 * A plugin that broadcasts the presentation state to a speaker view and
 * relays its commands back to the presentation.
 *
 * Open the speaker view by pressing {@link SpeakerPluginOptions.shortcut}
 * (`s` by default) or by calling {@link openSpeakerView}. The speaker view
 * opens at `/?speaker` and shows the presentation mirrored in an iframe,
 * the current scene's notes, a timer, an outline, and next/prev controls.
 *
 * Loading the deck with `?embed` — as the mirror iframe does — turns this
 * plugin into a passive mirror instead of the presenter: it follows the
 * presenter's broadcasts in place and never broadcasts or opens the popup.
 */
export function speakerPlugin(options: SpeakerPluginOptions = {}): Plugin {
	const shortcut = options.shortcut ?? 's';

	// The mirror iframe loads the deck with `?embed`; in that window the
	// plugin becomes a passive mirror. Both the mirror and the popup learn
	// their session from the URL the presenter opened, so the app shell never
	// has to know about it.
	const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
	const embed = params?.has('embed') ?? false;
	const sessionName = params?.get('session') ?? options.session ?? SPEAKER_SESSION;

	let ctx: PluginContext | null = null;
	let channel: SpeakerSession | null = null;
	let scenes: SpeakerScene[] = [];
	let lastPayload = '';
	let pendingSceneId = '';
	let notesRefresh: ReturnType<typeof setTimeout> | undefined = undefined;
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
			playing: ctx?.state.playing ?? false,
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

	/**
	 * Re-broadcasts shortly after a scene change. The change fires before the
	 * new scene's `[data-notes]` box mounts, so a synchronous broadcast would
	 * forward the previous scene's notes; waiting lets the mounted scene's
	 * notes win out.
	 */
	function scheduleNotesRefresh() {
		if (typeof window === 'undefined') return;
		if (notesRefresh) clearTimeout(notesRefresh);
		notesRefresh = setTimeout(() => broadcast(true), 100);
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
	 *
	 * `state.step` counts a completed step as the next one, matching
	 * `PresentationState.step`. `seek` and `setStepState` address steps
	 * by raw index, so a completed step's offset is folded back out first.
	 * A step the presenter is animating (`state.playing`) is played in place
	 * after seeking, so the mirror shows the animation live.
	 */
	function embedState(state: SpeakerState) {
		if (!ctx) return;
		const stepIndex = Math.max(0, state.step - (state.stepCompleted ? 1 : 0));
		if (ctx.state.sceneId !== state.sceneId) {
			// Seed the target scene so the navigation fast-forwards to the
			// broadcast step, then navigate once per distinct target scene to
			// avoid re-running the switch while it is still in flight.
			if (state.sceneId !== pendingSceneId) {
				pendingSceneId = state.sceneId;
				manager?.setStepState(state.sceneId, stepIndex, state.stepCompleted);
				void ctx.navigateTo(state.sceneId);
			}
		} else {
			pendingSceneId = '';
			const position =
				state.step === ctx.state.step &&
				state.stepCompleted === ctx.state.stepCompleted &&
				state.finished === ctx.state.finished;
			if (!position) {
				manager?.seek(stepIndex, state.stepCompleted, state.finished);
				// The presenter is animating this step, so play it in place; the
				// mirror runs the same deck, so both finish at about the same time.
				if (state.playing) manager?.play();
			} else if (state.playing && !ctx.state.playing) {
				// The presenter started animating the step we already sit on.
				// Play in place without seeking: re-seeking would tear down and
				// rebuild DOM-driven steps (layout), losing their animation.
				manager?.play();
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
				channel = new SpeakerSession(sessionName);
				channel.onmessage = handleMessage;
				if (embed) {
					// Ask the presenter for its current state to mirror it.
					channel.post({ type: 'hello' });
				} else {
					broadcast();
				}
			}

			return () => {
				if (notesRefresh) clearTimeout(notesRefresh);
				notesRefresh = undefined;
				channel?.close();
				channel = null;
				ctx = null;
				scenes = [];
				lastPayload = '';
				pendingSceneId = '';
			};
		},

		onSceneChange() {
			if (embed) return;
			broadcast();
			scheduleNotesRefresh();
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
			openSpeakerView(sessionName === SPEAKER_SESSION ? undefined : sessionName);
			return true;
		}
	};
}

/**
 * Opens the speaker view in a popup window. The window reuses a stable name
 * so repeated calls focus the existing popup instead of stacking new ones.
 */
export function openSpeakerView(session?: string) {
	if (typeof window === 'undefined') return;
	const path = session ? `/?speaker&session=${encodeURIComponent(session)}` : '/?speaker';
	window.open(path, 'animotion-speaker', 'popup,width=1360,height=860');
}
