import { flushSync, mount, unmount } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SpeakerView from './SpeakerView.svelte';

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

function state(overrides: Partial<SpeakerState> = {}): SpeakerState {
	return {
		sceneId: 'intro',
		sceneIndex: 0,
		totalScenes: 2,
		step: 0,
		totalSteps: 3,
		stepCompleted: false,
		finished: false,
		aspectRatio: { width: 1920, height: 1080 },
		scenes: [{ id: 'intro' }, { id: 'about' }],
		...overrides
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
		const app = mount(SpeakerView, { target: document.body });
		flushSync();

		expect(channel().posts).toContainEqual({ type: 'hello' });

		unmount(app);
	});

	it('shows a waiting message before the first state arrives', () => {
		const app = mount(SpeakerView, { target: document.body });
		flushSync();

		expect(document.body.textContent).toContain('press s to connect');

		unmount(app);
	});

	it('renders the notes, scene outline, and a mirror iframe from a state message', async () => {
		const app = mount(SpeakerView, { target: document.body });
		flushSync();
		await vi.waitFor(() => expect(channel().posts).toContainEqual({ type: 'hello' }));

		channel().dispatch({
			type: 'state',
			state: state({
				notes: '<p class="speaker-notes">Exported notes, <strong>rich</strong> content.</p>'
			})
		});
		await vi.waitFor(() => expect(document.body.textContent).toContain('Exported notes'));

		expect(document.querySelector('.speaker-notes strong')).not.toBeNull();
		expect(document.body.textContent).toContain('intro');
		expect(document.body.textContent).toContain('about');

		const iframe = document.querySelector('iframe');
		expect(iframe).not.toBeNull();
		expect(iframe).toHaveAttribute('src', '/?embed=1&channel=animotion%3Aspeaker');

		unmount(app);
	});

	it('swaps the notes when the scene changes', async () => {
		const app = mount(SpeakerView, { target: document.body });
		flushSync();
		channel().dispatch({
			type: 'state',
			state: state({ notes: '<strong>Intro</strong> notes.' })
		});
		await vi.waitFor(() => expect(document.body.textContent).toContain('Intro notes.'));

		channel().dispatch({
			type: 'state',
			state: state({ sceneId: 'about', sceneIndex: 1, notes: '<em>About</em> notes.' })
		});
		await vi.waitFor(() => expect(document.body.textContent).toContain('About notes.'));
		expect(document.body.textContent).not.toContain('Intro notes.');

		unmount(app);
	});

	it('shows a fallback when the scene has no notes', async () => {
		const app = mount(SpeakerView, { target: document.body });
		flushSync();
		channel().dispatch({ type: 'state', state: state() });
		await vi.waitFor(() => expect(document.body.textContent).toContain('No notes for this scene.'));

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
			props: { channel: 'custom' }
		});
		flushSync();

		expect(channel().name).toBe('custom');
		(document.querySelector('[aria-label="Toggle fullscreen"]') as HTMLButtonElement).click();
		expect(requestFullscreen).toHaveBeenCalledOnce();
		expect(channel().posts).not.toContainEqual({ type: 'fullscreen' });

		unmount(app);
	});

	it('sends next when the forward button is pressed', () => {
		const app = mount(SpeakerView, { target: document.body });
		flushSync();

		channel().dispatch({ type: 'state', state: state() });
		vi.waitFor(() => expect(document.querySelectorAll('footer button')).toHaveLength(2));

		const button = document.querySelector('[aria-label="Next"]');
		expect(button).not.toBeNull();
		(button as HTMLButtonElement).click();
		flushSync();

		expect(channel().posts).toContainEqual({ type: 'next' });

		unmount(app);
	});

	it('sends next and prev from the arrow keys', () => {
		const app = mount(SpeakerView, { target: document.body });
		flushSync();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
		flushSync();

		expect(channel().posts).toContainEqual({ type: 'next' });
		expect(channel().posts).toContainEqual({ type: 'prev' });

		unmount(app);
	});

	it('sends goto when an outline scene is clicked', async () => {
		const app = mount(SpeakerView, { target: document.body });
		flushSync();

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
