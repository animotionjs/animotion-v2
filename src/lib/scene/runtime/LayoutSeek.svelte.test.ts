import { beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LayoutSeekFixture, { manager } from './fixtures/LayoutSeekFixture.svelte';

beforeEach(() => {
	document.body.innerHTML = '';
});

describe('SceneManager.seekToTime (layout step)', () => {
	function expectMidFlight() {
		const badge = document.querySelector<HTMLElement>('[data-layout="badge"]');
		expect(badge).not.toBeNull();
		// an empty style means no enter tween was built, so the badge popped in
		expect(badge!.style.transform).not.toBe('');
		// the scale in is mid flight, so the badge is not full size yet
		expect(badge!.style.transform).not.toContain('scale(1)');

		const title = document.querySelector<HTMLElement>('[data-layout="title"]')!;
		// the title glides to make room, so its flip transform is active
		expect(title.style.transform).not.toBe('');
		// its own opacity is bound to the scene, so a tweened value here would
		// mean the text faded in from a stale snapshot instead of gliding
		expect(title.style.opacity).toBe('1');
	}

	it('freezes the flip and the enter transition mid flight', () => {
		manager.enableRenderMode();
		const app = mount(LayoutSeekFixture, { target: document.body });
		flushSync();

		// half of the layout step's animation window (0.6 to 1.2 seconds)
		manager.seekToTime(0.9);
		expectMidFlight();

		unmount(app);
	});

	it('keeps interpolating when scrubbing lands twice inside the layout', () => {
		manager.enableRenderMode();
		const app = mount(LayoutSeekFixture, { target: document.body });
		flushSync();

		manager.seekToTime(0.9);
		manager.seekToTime(0.75);
		expectMidFlight();

		manager.seekToTime(1.05);
		expectMidFlight();

		unmount(app);
	});
});
