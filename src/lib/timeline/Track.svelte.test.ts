import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Track from './Track.svelte';
import { TimelineController } from './timeline.svelte.js';
import { SceneManager } from '../scene/runtime/runtime.svelte.js';
import { TickStep } from '../scene/runtime/steps.js';

function trackController() {
	// two one second steps at thirty fps, two seconds total
	const manager = new SceneManager();
	manager.load({ steps: [new TickStep(() => {}, 1), new TickStep(() => {}, 1)] });
	return new TimelineController(manager, 30);
}

function tracker() {
	const element = document.querySelector<HTMLElement>('[role="slider"]');
	expect(element, 'track').not.toBeNull();
	return element!;
}

function mockTrack(element: HTMLElement, width = 1200) {
	// the browser gives the track a real size, but a fake geometry keeps the math exact
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
	// capture is a no-op in tests but the track calls it on drag start
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

describe('Track scrubbing', () => {
	it('seeks to the dragged position', async () => {
		const controller = trackController();
		const app = mount(Track, { target: document.body, props: { controller } });
		flushSync();

		const track = tracker();
		mockTrack(track);
		track.dispatchEvent(pointer('pointerdown', 300));
		flushSync();
		expect(controller.time).toBe(0.5);

		track.dispatchEvent(pointer('pointermove', 600));
		await frame();
		flushSync();
		expect(controller.time).toBe(1);

		track.dispatchEvent(pointer('pointerup', 600));
		flushSync();
		expect(controller.time).toBe(1);

		unmount(app);
	});

	it('keeps scrubbing when pointer capture is lost mid-drag', async () => {
		const controller = trackController();
		const app = mount(Track, { target: document.body, props: { controller } });
		flushSync();

		const track = tracker();
		mockTrack(track);
		track.dispatchEvent(pointer('pointerdown', 300));
		flushSync();
		expect(controller.time).toBe(0.5);

		// chromium can drop the capture mid drag, which must not end the scrub
		track.dispatchEvent(new Event('lostpointercapture', { bubbles: true }));
		flushSync();

		track.dispatchEvent(pointer('pointermove', 600));
		await frame();
		flushSync();
		expect(controller.time).toBe(1);

		track.dispatchEvent(pointer('pointerup', 600));
		flushSync();
		expect(controller.time).toBe(1);

		unmount(app);
	});

	it('lands the release position even without a final move', async () => {
		const controller = trackController();
		const app = mount(Track, { target: document.body, props: { controller } });
		flushSync();

		const track = tracker();
		mockTrack(track);
		track.dispatchEvent(pointer('pointerdown', 300));
		flushSync();
		expect(controller.time).toBe(0.5);

		track.dispatchEvent(pointer('pointerup', 900));
		flushSync();
		expect(controller.time).toBe(1.5);

		unmount(app);
	});

	it('still seeks when pointer capture fails', () => {
		const controller = trackController();
		const app = mount(Track, { target: document.body, props: { controller } });
		flushSync();

		const track = tracker();
		mockTrack(track);
		track.setPointerCapture = () => {
			throw new DOMException('no active pointer', 'NotFoundError');
		};
		track.dispatchEvent(pointer('pointerdown', 600));
		flushSync();
		expect(controller.time).toBe(1);

		unmount(app);
	});
});
