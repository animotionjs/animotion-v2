import { beforeEach, describe, expect, it, vi } from 'vitest';
import { speakerPlugin } from './speaker';
import type { SpeakerMessage, SpeakerState } from './channel';
import type { PluginContext } from '../types';

vi.mock('../../scene/runtime/context.svelte.js', () => ({
	getSceneManager: vi.fn()
}));

import { getSceneManager } from '../../scene/runtime/context.svelte.js';

class FakeBroadcastChannel {
	static instances: FakeBroadcastChannel[] = [];
	name: string;
	onmessage: ((event: MessageEvent) => void) | null = null;
	posts: unknown[] = [];
	closed = false;

	constructor(name: string) {
		this.name = name;
		FakeBroadcastChannel.instances.push(this);
	}

	postMessage(data: unknown) {
		this.posts.push(data);
	}

	close() {
		this.closed = true;
	}

	dispatch(data: unknown) {
		this.onmessage?.({ data } as MessageEvent);
	}
}

function lastState(channel: FakeBroadcastChannel): SpeakerState {
	const message = channel.posts[channel.posts.length - 1] as SpeakerMessage;
	expect(message.type).toBe('state');
	return (message as { type: 'state'; state: SpeakerState }).state;
}

function createContext(): PluginContext {
	const sequence = [
		{
			id: 'intro',
			order: 1,
			component: () => Promise.resolve({ default: (() => {}) as never })
		},
		{
			id: 'about',
			order: 2,
			component: () => Promise.resolve({ default: (() => {}) as never })
		}
	];

	const navigateTo = vi.fn();
	const next = vi.fn();
	const prev = vi.fn();

	const state = {
		sceneId: 'intro',
		sceneIndex: 0,
		totalScenes: 2,
		step: 0,
		totalSteps: 0,
		stepCompleted: false,
		finished: false
	};

	return { state, sequence, navigateTo, next, prev };
}

function channel(): FakeBroadcastChannel {
	const instance = FakeBroadcastChannel.instances[0];
	if (!instance) throw new Error('No BroadcastChannel was created');
	return instance;
}

beforeEach(() => {
	vi.unstubAllGlobals();
	FakeBroadcastChannel.instances = [];
	vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
});

describe('speakerPlugin', () => {
	it('broadcasts the scene outline and full state', () => {
		const ctx = createContext();
		const plugin = speakerPlugin();
		plugin.setup?.(ctx);

		const state = lastState(channel());
		expect(state.scenes).toEqual([{ id: 'intro' }, { id: 'about' }]);
		expect(state.totalScenes).toBe(2);
		expect(state.aspectRatio).toEqual({ width: 1920, height: 1080 });
	});

	it('re-broadcasts the current state on hello', async () => {
		const ctx = createContext();
		const plugin = speakerPlugin();
		plugin.setup?.(ctx);
		await vi.waitFor(() => expect(channel().posts.length).toBeGreaterThan(0));

		const before = channel().posts.length;
		channel().dispatch({ type: 'hello' });
		expect(channel().posts.length).toBe(before + 1);
	});

	it('forwards next, prev, and goto commands to the context', async () => {
		const ctx = createContext();
		const plugin = speakerPlugin();
		plugin.setup?.(ctx);

		channel().dispatch({ type: 'next' });
		expect(ctx.next).toHaveBeenCalledOnce();

		channel().dispatch({ type: 'prev' });
		expect(ctx.prev).toHaveBeenCalledOnce();

		channel().dispatch({ type: 'goto', id: 'about' });
		expect(ctx.navigateTo).toHaveBeenCalledWith('about');
	});

	it('broadcasts the active scene on scene change', async () => {
		const ctx = createContext();
		const plugin = speakerPlugin();
		plugin.setup?.(ctx);

		Object.assign(ctx.state, { sceneId: 'about', sceneIndex: 1 });
		plugin.onSceneChange?.({ id: 'about', index: 1 });

		const state = lastState(channel());
		expect(state.sceneId).toBe('about');
		expect(state.sceneIndex).toBe(1);
	});

	it('broadcasts step progress on step change', async () => {
		const ctx = createContext();
		const plugin = speakerPlugin();
		plugin.setup?.(ctx);

		Object.assign(ctx.state, { step: 2, totalSteps: 5 });
		plugin.onStepChange?.(2, 5);

		const state = lastState(channel());
		expect(state.step).toBe(2);
		expect(state.totalSteps).toBe(5);
	});

	it('broadcasts the finished flag on step change', async () => {
		const ctx = createContext();
		const plugin = speakerPlugin();
		plugin.setup?.(ctx);

		Object.assign(ctx.state, { finished: true });
		plugin.onStepChange?.(3, 3);

		const state = lastState(channel());
		expect(state.finished).toBe(true);
	});

	it('opens the speaker view from the shortcut key', async () => {
		const open = vi.fn();
		vi.stubGlobal('window', { open });
		const ctx = createContext();
		const plugin = speakerPlugin();
		plugin.setup?.(ctx);

		const event = {
			key: 's',
			metaKey: false,
			ctrlKey: false,
			altKey: false,
			repeat: false
		} as KeyboardEvent;
		const consumed = plugin.onKeydown?.(event);

		expect(consumed).toBe(true);
		expect(open).toHaveBeenCalledWith('/speaker', 'animotion-speaker', expect.any(String));
	});

	it('passes a custom channel to the speaker view route', () => {
		const open = vi.fn();
		vi.stubGlobal('window', { open });
		const plugin = speakerPlugin({ channel: 'deck/channel' });
		plugin.setup?.(createContext());

		plugin.onKeydown?.({
			key: 's',
			metaKey: false,
			ctrlKey: false,
			altKey: false,
			repeat: false
		} as KeyboardEvent);

		expect(open).toHaveBeenCalledWith(
			'/speaker?channel=deck%2Fchannel',
			'animotion-speaker',
			expect.any(String)
		);
	});

	it('ignores the shortcut when modifiers are pressed', async () => {
		const open = vi.fn();
		vi.stubGlobal('window', { open });
		const ctx = createContext();
		const plugin = speakerPlugin();
		plugin.setup?.(ctx);

		const event = {
			key: 's',
			metaKey: true,
			ctrlKey: false,
			altKey: false,
			repeat: false
		} as KeyboardEvent;
		const consumed = plugin.onKeydown?.(event);

		expect(consumed).toBeUndefined();
		expect(open).not.toHaveBeenCalled();
	});

	it('closes the channel on cleanup', () => {
		const ctx = createContext();
		const plugin = speakerPlugin();
		const cleanup = plugin.setup?.(ctx);
		if (typeof cleanup === 'function') cleanup();

		expect(channel().closed).toBe(true);
	});

	describe('embed mode', () => {
		class FakeManager {
			setStepState = vi.fn();
			seek = vi.fn();
		}

		function setupEmbed() {
			const manager = new FakeManager();
			vi.mocked(getSceneManager).mockReturnValue(manager as never);
			const ctx = createContext();
			const plugin = speakerPlugin({ embed: true });
			plugin.setup?.(ctx);
			return { ctx, plugin, manager, channel: channel() };
		}

		beforeEach(() => {
			vi.mocked(getSceneManager).mockReset();
		});

		it('asks the presenter for its current state instead of broadcasting', () => {
			const { plugin, channel } = setupEmbed();

			expect(channel.posts).toEqual([{ type: 'hello' }]);

			plugin.onSceneChange?.({ id: 'intro', index: 0 });
			plugin.onStepChange?.(0, 0);
			expect(channel.posts).toEqual([{ type: 'hello' }]);
		});

		it('navigates to a broadcast scene and seeds its step', () => {
			const { ctx, manager, channel } = setupEmbed();

			channel.dispatch({
				type: 'state',
				state: {
					sceneId: 'about',
					sceneIndex: 1,
					totalScenes: 2,
					step: 2,
					totalSteps: 4,
					stepCompleted: false,
					finished: false,
					aspectRatio: { width: 1920, height: 1080 },
					scenes: [{ id: 'intro' }, { id: 'about' }]
				}
			});

			expect(manager.setStepState).toHaveBeenCalledWith('about', 2, false);
			expect(ctx.navigateTo).toHaveBeenCalledWith('about');
		});

		it('seeks in place when the broadcast step changes within the same scene', () => {
			const { manager, channel } = setupEmbed();

			channel.dispatch({
				type: 'state',
				state: {
					sceneId: 'intro',
					sceneIndex: 0,
					totalScenes: 2,
					step: 1,
					totalSteps: 4,
					stepCompleted: false,
					finished: false,
					aspectRatio: { width: 1920, height: 1080 },
					scenes: [{ id: 'intro' }, { id: 'about' }]
				}
			});

			expect(manager.seek).toHaveBeenCalledWith(1, false, false);
			expect(manager.setStepState).not.toHaveBeenCalled();
		});

		it('seeks to the finished state when the broadcast scene is complete', () => {
			const { manager, channel } = setupEmbed();

			channel.dispatch({
				type: 'state',
				state: {
					sceneId: 'intro',
					sceneIndex: 0,
					totalScenes: 2,
					step: 3,
					totalSteps: 4,
					stepCompleted: false,
					finished: true,
					aspectRatio: { width: 1920, height: 1080 },
					scenes: [{ id: 'intro' }, { id: 'about' }]
				}
			});

			expect(manager.seek).toHaveBeenCalledWith(3, false, true);
		});

		it('seeks in place when the broadcast step completes without advancing', () => {
			const { manager, channel } = setupEmbed();

			channel.dispatch({
				type: 'state',
				state: {
					sceneId: 'intro',
					sceneIndex: 0,
					totalScenes: 2,
					step: 0,
					totalSteps: 2,
					stepCompleted: true,
					finished: false,
					aspectRatio: { width: 1920, height: 1080 },
					scenes: [{ id: 'intro' }, { id: 'about' }]
				}
			});

			expect(manager.seek).toHaveBeenCalledWith(0, true, false);
			expect(manager.setStepState).not.toHaveBeenCalled();
		});

		it('does not seek again when the broadcast position is unchanged', () => {
			const { ctx, manager, channel } = setupEmbed();

			channel.dispatch({
				type: 'state',
				state: {
					sceneId: 'intro',
					sceneIndex: 0,
					totalScenes: 2,
					step: 1,
					totalSteps: 4,
					stepCompleted: true,
					finished: false,
					aspectRatio: { width: 1920, height: 1080 },
					scenes: [{ id: 'intro' }, { id: 'about' }]
				}
			});

			expect(manager.seek).toHaveBeenCalledWith(1, true, false);

			// The mirror keeps its own position in sync after seeking; a
			// re-broadcast of the same triple must not drive a second seek.
			Object.assign(ctx.state, { step: 1, stepCompleted: true, finished: false });
			channel.dispatch({
				type: 'state',
				state: {
					sceneId: 'intro',
					sceneIndex: 0,
					totalScenes: 2,
					step: 1,
					totalSteps: 4,
					stepCompleted: true,
					finished: false,
					aspectRatio: { width: 1920, height: 1080 },
					scenes: [{ id: 'intro' }, { id: 'about' }]
				}
			});

			expect(manager.seek).toHaveBeenCalledTimes(1);
		});

		it('ignores next and prev commands', () => {
			const { ctx, plugin, channel } = setupEmbed();

			channel.dispatch({ type: 'next' });
			channel.dispatch({ type: 'prev' });

			expect(ctx.next).not.toHaveBeenCalled();
			expect(ctx.prev).not.toHaveBeenCalled();
			expect(channel.posts).toEqual([{ type: 'hello' }]);

			plugin.onSceneChange?.({ id: 'intro', index: 0 });
			plugin.onStepChange?.(0, 0);
			expect(channel.posts).toEqual([{ type: 'hello' }]);
		});

		it('ignores goto commands', () => {
			const { ctx, channel } = setupEmbed();

			channel.dispatch({ type: 'goto', id: 'about' });

			expect(ctx.navigateTo).not.toHaveBeenCalled();
			expect(channel.posts).toEqual([{ type: 'hello' }]);
		});

		it('never broadcasts a state reply on hello', () => {
			const { channel } = setupEmbed();

			channel.dispatch({ type: 'hello' });

			expect(channel.posts).toEqual([{ type: 'hello' }]);
		});

		it('navigates only once per distinct broadcast scene while in flight', () => {
			const { ctx, manager, channel } = setupEmbed();

			channel.dispatch({
				type: 'state',
				state: {
					sceneId: 'about',
					sceneIndex: 1,
					totalScenes: 2,
					step: 2,
					totalSteps: 4,
					stepCompleted: false,
					finished: false,
					aspectRatio: { width: 1920, height: 1080 },
					scenes: [{ id: 'intro' }, { id: 'about' }]
				}
			});
			// The fake context never commits the navigation, so re-broadcasting
			// the same target must not trigger a second navigateTo.
			channel.dispatch({
				type: 'state',
				state: {
					sceneId: 'about',
					sceneIndex: 1,
					totalScenes: 2,
					step: 2,
					totalSteps: 4,
					stepCompleted: false,
					finished: false,
					aspectRatio: { width: 1920, height: 1080 },
					scenes: [{ id: 'intro' }, { id: 'about' }]
				}
			});

			expect(ctx.navigateTo).toHaveBeenCalledOnce();
			expect(manager.setStepState).toHaveBeenCalledTimes(1);
		});

		it('does not open the speaker view from the shortcut', () => {
			const open = vi.fn();
			vi.stubGlobal('window', { open });
			const { plugin } = setupEmbed();

			const event = {
				key: 's',
				metaKey: false,
				ctrlKey: false,
				altKey: false,
				repeat: false
			} as KeyboardEvent;
			const consumed = plugin.onKeydown?.(event);

			expect(consumed).toBeUndefined();
			expect(open).not.toHaveBeenCalled();
		});

		it('forwards arrows to the presenter instead of navigating itself', () => {
			const { plugin, channel } = setupEmbed();
			channel.posts.forEach(() => channel.posts.pop());

			const next = plugin.onKeydown?.({
				key: 'ArrowRight',
				metaKey: false,
				ctrlKey: false,
				altKey: false,
				repeat: false
			} as KeyboardEvent);
			expect(next).toBe(true);
			expect(channel.posts).toEqual([{ type: 'next' }]);

			const prev = plugin.onKeydown?.({
				key: 'ArrowLeft',
				metaKey: false,
				ctrlKey: false,
				altKey: false,
				repeat: false
			} as KeyboardEvent);
			expect(prev).toBe(true);
			expect(channel.posts).toEqual([{ type: 'next' }, { type: 'prev' }]);
		});
	});
});
