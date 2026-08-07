import { flushSync, mount, tick, unmount } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SpeakerView from './SpeakerView.svelte';

import type { Sequence } from '#lib';
import type { SpeakerMessage, SpeakerState } from './channel';

class FakeBroadcastChannel {
	static instances: FakeBroadcastChannel[] = [];
	name: string;
	onmessage: ((event: MessageEvent) => void) | null = null;
	posts: unknown[] = [];

	constructor(name: string) {
		this.name = name;
		FakeBroadcastChannel.instances.push(this);
	}

	postMessage(data: unknown) {
		this.posts.push(data);
	}

	close() {}

	dispatch(data: unknown) {
		this.onmessage?.({ data } as MessageEvent);
	}
}

const sequence: Sequence = [
	{
		id: 'intro',
		order: 1,
		component: () => import('./fixtures/PreviewScene.svelte')
	},
	{
		id: 'about',
		order: 2,
		component: () => import('./fixtures/PreviewScene.svelte')
	}
];

function state(): SpeakerState {
	return {
		sceneId: 'intro',
		sceneIndex: 0,
		totalScenes: 2,
		step: 0,
		totalSteps: 3,
		finished: false,
		aspectRatio: { width: 1920, height: 1080 },
		scenes: [{ id: 'intro' }, { id: 'about' }]
	};
}

function channel(): FakeBroadcastChannel {
	const instance = FakeBroadcastChannel.instances[0];
	if (!instance) throw new Error('No BroadcastChannel was created');
	return instance;
}

beforeEach(() => {
	vi.unstubAllGlobals();
	document.body.innerHTML = '';
	FakeBroadcastChannel.instances = [];
	vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
});

describe('SpeakerView', () => {
	it('asks for the current state on mount', () => {
		const app = mount(SpeakerView, { target: document.body, props: { sequence } });
		flushSync();

		expect(channel().posts).toContainEqual({ type: 'hello' });

		unmount(app);
	});

	it('shows a waiting message before the first state arrives', () => {
		const app = mount(SpeakerView, { target: document.body, props: { sequence } });
		flushSync();

		expect(document.body.textContent).toContain('press s to connect');

		unmount(app);
	});

	it('renders notes, scene outline, and previews from a state message', async () => {
		const app = mount(SpeakerView, { target: document.body, props: { sequence } });
		flushSync();
		await tick();
		await vi.waitFor(() => expect(channel().posts).toContainEqual({ type: 'hello' }));

		channel().dispatch({ type: 'state', state: state() });
		await vi.waitFor(() => expect(document.body.textContent).toContain('Exported notes'));

		const text = document.body.textContent ?? '';
		expect(text).toContain('Exported notes, not broadcast notes.');
		expect(text).not.toContain('Broadcast notes must not be rendered.');
		expect(text).toContain('intro');
		expect(text).toContain('about');
		expect(text).toContain('Preview content');
		expect(document.querySelector('section')?.parentElement).toHaveClass('overflow-hidden');

		unmount(app);
	});

	it('uses a custom channel and handles fullscreen locally', () => {
		const requestFullscreen = vi.fn().mockResolvedValue(undefined);
		const exitFullscreen = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
		Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
		document.documentElement.requestFullscreen = requestFullscreen;
		document.exitFullscreen = exitFullscreen;

		const app = mount(SpeakerView, {
			target: document.body,
			props: { sequence, channel: 'custom' }
		});
		flushSync();

		expect(channel().name).toBe('custom');
		(document.querySelector('[aria-label="Toggle fullscreen"]') as HTMLButtonElement).click();
		expect(requestFullscreen).toHaveBeenCalledOnce();
		expect(channel().posts).not.toContainEqual({ type: 'fullscreen' });

		unmount(app);
	});

	it('sends next when the forward button is pressed', async () => {
		const app = mount(SpeakerView, { target: document.body, props: { sequence } });
		flushSync();

		channel().dispatch({ type: 'state', state: state() });
		await vi.waitFor(() => expect(document.querySelectorAll('footer button')).toHaveLength(2));

		const button = document.querySelector('[aria-label="Next"]');
		expect(button).not.toBeNull();
		(button as HTMLButtonElement).click();
		flushSync();

		expect(channel().posts).toContainEqual({ type: 'next' });

		unmount(app);
	});

	it('sends next and prev from the arrow keys', () => {
		const app = mount(SpeakerView, { target: document.body, props: { sequence } });
		flushSync();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
		flushSync();

		expect(channel().posts).toContainEqual({ type: 'next' });
		expect(channel().posts).toContainEqual({ type: 'prev' });

		unmount(app);
	});

	it('sends goto when an outline scene is clicked', async () => {
		const app = mount(SpeakerView, { target: document.body, props: { sequence } });
		flushSync();
		await tick();
		await vi.waitFor(() => expect(channel().posts).toContainEqual({ type: 'hello' }));

		channel().dispatch({ type: 'state', state: state() });
		await vi.waitFor(() => expect(document.querySelectorAll('footer button')).toHaveLength(2));

		const outlineButtons = [...document.querySelectorAll('footer button')];
		const about = outlineButtons.find((button) => button.textContent?.includes('about'));
		expect(about).toBeDefined();
		(about as HTMLButtonElement).click();
		flushSync();

		const messages = channel().posts as SpeakerMessage[];
		expect(messages).toContainEqual({ type: 'goto', id: 'about' });

		unmount(app);
	});
});
