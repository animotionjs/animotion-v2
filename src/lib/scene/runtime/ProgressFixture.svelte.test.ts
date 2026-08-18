import { describe, expect, it, beforeEach } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ProgressFixture, { manager } from './fixtures/ProgressFixture.svelte';

beforeEach(() => {
	document.body.innerHTML = '';
});

describe('scene step/progress reactivity', () => {
	it('re-renders markup as the timeline advances', () => {
		manager.enableRenderMode();
		const app = mount(ProgressFixture, { target: document.body });
		flushSync();

		const position = document.querySelector('[data-testid="position"]');
		expect(position?.textContent).toBe('0:0');

		manager.next();
		flushSync();
		expect(position?.textContent).toBe('0:0');

		manager.advanceFrame(0.5);
		flushSync();
		expect(position?.textContent).toBe('0:0.5');

		manager.advanceFrame(0.5);
		flushSync();
		expect(position?.textContent).toBe('0:1');

		manager.next();
		flushSync();
		expect(position?.textContent).toBe('1:0');

		unmount(app);
	});
});
