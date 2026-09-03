import { beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Player from './Player.svelte';
import PlayerScene from './fixtures/PlayerScene.svelte';

beforeEach(() => {
	document.body.innerHTML = '';
});

function scrubber() {
	const element = document.querySelector<HTMLElement>('[role="slider"]');
	expect(element, 'progress bar').not.toBeNull();
	return element!;
}

function mockBar(element: HTMLElement, width = 1000) {
	// jsdom has no layout, so the bar gets a fake geometry for seeking
	element.getBoundingClientRect = () =>
		({
			left: 0,
			top: 0,
			right: width,
			bottom: 20,
			width,
			height: 20,
			x: 0,
			y: 0,
			toJSON: () => {}
		}) as DOMRect;
	// capture is a no-op in tests but the player calls it on drag start
	(element as HTMLElement & { setPointerCapture: (id: number) => void }).setPointerCapture =
		() => {};
}

function pointer(type: string, clientX: number) {
	const event = new Event(type, { bubbles: true });
	(event as Event & { clientX: number }).clientX = clientX;
	(event as Event & { pointerId: number }).pointerId = 1;
	return event;
}

function frame() {
	// seeks from moves run behind one animation frame, so tests wait for it
	return new Promise<void>((resolve) => {
		requestAnimationFrame(() => resolve());
	});
}

function seek(element: HTMLElement, ratio: number, width = 1000) {
	mockBar(element, width);
	element.dispatchEvent(pointer('pointerdown', ratio * width));
	element.dispatchEvent(pointer('pointerup', ratio * width));
}

function state() {
	return document.querySelector('[data-testid="state"]')?.textContent ?? '';
}

describe('Player transport', () => {
	it('advances one frame per period press with keyboard enabled', () => {
		const app = mount(Player, {
			target: document.body,
			props: { scene: PlayerScene, keyboard: true }
		});
		flushSync();

		expect(state()).toBe('0');

		window.dispatchEvent(new KeyboardEvent('keydown', { key: '.' }));
		flushSync();
		expect(state()).toBe('3');

		window.dispatchEvent(new KeyboardEvent('keydown', { key: '.' }));
		flushSync();
		expect(state()).toBe('7');

		unmount(app);
	});

	it('clamps at the end of the scene', () => {
		const app = mount(Player, {
			target: document.body,
			props: { scene: PlayerScene, keyboard: true }
		});
		flushSync();

		// the scene runs thirty frames at the default sixty fps
		for (let i = 0; i < 30; i++) {
			window.dispatchEvent(new KeyboardEvent('keydown', { key: '.' }));
			flushSync();
		}

		expect(state()).toBe('100');

		window.dispatchEvent(new KeyboardEvent('keydown', { key: '.' }));
		flushSync();
		expect(state()).toBe('100');

		unmount(app);
	});

	it('steps back one frame per comma press with keyboard enabled', () => {
		const app = mount(Player, {
			target: document.body,
			props: { scene: PlayerScene, keyboard: true }
		});
		flushSync();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: '.' }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: '.' }));
		flushSync();
		expect(state()).toBe('7');

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ',' }));
		flushSync();
		expect(state()).toBe('3');

		unmount(app);
	});

	it('seeks to the clicked position on the scrubber', () => {
		const app = mount(Player, { target: document.body, props: { scene: PlayerScene } });
		flushSync();

		const bar = scrubber();
		seek(bar, 0.5);
		flushSync();

		// half the half second tween lands on frame fifteen
		expect(state()).toBe('50');
		expect(bar.getAttribute('aria-valuenow')).toBe('0.25');

		seek(bar, 0.54);
		flushSync();
		expect(state()).toBe('53');

		unmount(app);
	});

	it('updates live while dragging across the bar', async () => {
		const app = mount(Player, { target: document.body, props: { scene: PlayerScene } });
		flushSync();

		const bar = scrubber();
		mockBar(bar);
		bar.dispatchEvent(pointer('pointerdown', 200));
		flushSync();
		expect(state()).toBe('20');

		bar.dispatchEvent(pointer('pointermove', 400));
		await frame();
		flushSync();
		expect(state()).toBe('40');

		bar.dispatchEvent(pointer('pointerup', 400));
		flushSync();
		expect(state()).toBe('40');

		unmount(app);
	});

	it('coalesces rapid moves into one seek landing on the last position', async () => {
		const app = mount(Player, { target: document.body, props: { scene: PlayerScene } });
		flushSync();

		const bar = scrubber();
		mockBar(bar);
		bar.dispatchEvent(pointer('pointerdown', 200));
		flushSync();
		expect(state()).toBe('20');

		bar.dispatchEvent(pointer('pointermove', 300));
		bar.dispatchEvent(pointer('pointermove', 400));
		flushSync();
		// both moves queued behind the same animation frame instead of seeking twice
		expect(state()).toBe('20');

		await frame();
		flushSync();
		expect(state()).toBe('40');

		bar.dispatchEvent(pointer('pointerup', 400));
		flushSync();
		expect(state()).toBe('40');

		unmount(app);
	});

	it('keeps scrubbing when pointer capture is lost mid-drag', async () => {
		const app = mount(Player, { target: document.body, props: { scene: PlayerScene } });
		flushSync();

		const bar = scrubber();
		mockBar(bar);
		bar.dispatchEvent(pointer('pointerdown', 200));
		flushSync();
		expect(state()).toBe('20');

		// chromium can drop the capture mid drag, which must not end the scrub
		bar.dispatchEvent(new Event('lostpointercapture', { bubbles: true }));
		flushSync();
		expect(bar.dataset.scrubbing).toBe('true');

		bar.dispatchEvent(pointer('pointermove', 400));
		await frame();
		flushSync();
		expect(state()).toBe('40');

		bar.dispatchEvent(pointer('pointerup', 400));
		flushSync();
		expect(bar.dataset.scrubbing).toBe('false');
		expect(state()).toBe('40');

		unmount(app);
	});

	it('seeks after playing and pausing', async () => {
		const app = mount(Player, { target: document.body, props: { scene: PlayerScene } });
		flushSync();

		button('Play').click();
		flushSync();
		expect(button('Pause')).not.toBeNull();

		button('Pause').click();
		flushSync();
		expect(button('Play')).not.toBeNull();

		const bar = scrubber();
		mockBar(bar);
		bar.dispatchEvent(pointer('pointerdown', 200));
		flushSync();
		expect(state()).toBe('20');

		bar.dispatchEvent(pointer('pointermove', 600));
		await frame();
		flushSync();
		expect(state()).toBe('60');

		bar.dispatchEvent(pointer('pointerup', 600));
		flushSync();
		expect(state()).toBe('60');

		unmount(app);
	});

	it('recovers when the release lands outside the bar', () => {
		const app = mount(Player, { target: document.body, props: { scene: PlayerScene } });
		flushSync();

		const bar = scrubber();
		mockBar(bar);
		bar.dispatchEvent(pointer('pointerdown', 200));
		flushSync();
		expect(state()).toBe('20');
		expect(bar.dataset.scrubbing).toBe('true');

		// released outside the window, so the bar never sees the pointerup
		document.body.dispatchEvent(pointer('pointerup', 400));
		flushSync();
		expect(bar.dataset.scrubbing).toBe('false');

		// the next drag seeks normally instead of staying stuck
		seek(bar, 0.5);
		flushSync();
		expect(state()).toBe('50');

		unmount(app);
	});

	it('still seeks when pointer capture fails', () => {
		const app = mount(Player, { target: document.body, props: { scene: PlayerScene } });
		flushSync();

		const bar = scrubber();
		mockBar(bar);
		bar.setPointerCapture = () => {
			throw new DOMException('no active pointer', 'NotFoundError');
		};
		bar.dispatchEvent(pointer('pointerdown', 500));
		flushSync();
		expect(state()).toBe('50');

		unmount(app);
	});

	it('steps one frame with the arrow keys when the bar is focused', () => {
		const app = mount(Player, { target: document.body, props: { scene: PlayerScene } });
		flushSync();

		const bar = scrubber();
		mockBar(bar);
		bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		flushSync();
		expect(state()).toBe('3');

		bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		flushSync();
		expect(state()).toBe('0');

		bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
		flushSync();
		expect(state()).toBe('100');

		bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
		flushSync();
		expect(state()).toBe('0');

		// frame step keys also work from the focused bar
		bar.dispatchEvent(new KeyboardEvent('keydown', { key: '.', bubbles: true }));
		flushSync();
		expect(state()).toBe('3');

		bar.dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true }));
		flushSync();
		expect(state()).toBe('0');

		// space toggles playback from the focused bar
		bar.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
		flushSync();
		expect(button('Pause')).not.toBeNull();

		bar.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
		flushSync();
		expect(button('Play')).not.toBeNull();

		unmount(app);
	});

	it('toggles only once when space fires on the focused play button', () => {
		const app = mount(Player, {
			target: document.body,
			props: { scene: PlayerScene, keyboard: true }
		});
		flushSync();

		const play = button('Play');
		// the window shortcut stands down on buttons, so the native click owns it
		play.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
		flushSync();
		expect(button('Play')).not.toBeNull();

		play.click();
		flushSync();
		expect(button('Pause')).not.toBeNull();

		unmount(app);
	});

	it('toggles between play and pause', () => {
		const app = mount(Player, { target: document.body, props: { scene: PlayerScene } });
		flushSync();

		const play = button('Play');
		play.click();
		flushSync();
		expect(button('Pause')).not.toBeNull();

		button('Pause').click();
		flushSync();
		expect(button('Play')).not.toBeNull();

		unmount(app);
	});

	it('resolves the aspect preset onto the stage', () => {
		const app = mount(Player, {
			target: document.body,
			props: { scene: PlayerScene, aspect: 'square' }
		});
		flushSync();

		const stage = document.querySelector<HTMLElement>('[style*="aspect-ratio"]');
		expect(stage, 'stage').not.toBeNull();
		expect(stage!.style.aspectRatio).toBe('1 / 1');

		unmount(app);
	});

	it('ignores the keyboard when keyboard is disabled', () => {
		const app = mount(Player, { target: document.body, props: { scene: PlayerScene } });
		flushSync();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: '.' }));
		flushSync();
		expect(state()).toBe('0');

		unmount(app);
	});
});

function button(label: string) {
	const element = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
	expect(element, `button ${label}`).not.toBeNull();
	return element!;
}
