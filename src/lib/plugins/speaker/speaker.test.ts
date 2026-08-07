import { beforeEach, describe, expect, it, vi } from 'vitest';
import { speakerPlugin } from './speaker';
import type { SpeakerMessage, SpeakerState } from './channel';
import type { PluginContext } from '../types';

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
});
