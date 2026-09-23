import { describe, expect, it, beforeEach } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import MultiCodeFixture from './fixtures/MultiCodeFixture.svelte';
import { managers } from './fixtures/code-scroll-managers.js';
import { whenReady } from './highlighter';
import { registerTestLanguages } from './test-languages';

registerTestLanguages();

beforeEach(() => {
	document.body.innerHTML = '';
});

describe('multiple code blocks', () => {
	it('renders each block independently and morphs them separately', async () => {
		await whenReady();
		const app = mount(MultiCodeFixture, { target: document.body });
		flushSync();

		const blocks = document.querySelectorAll('.code-block');
		expect(blocks.length).toBe(2);
		expect(blocks[0].textContent).toContain('x = 1');
		expect(blocks[1].textContent).toContain('y = 2');

		const manager = managers.at(-1)!;
		manager.enableRenderMode();

		manager.next();
		manager.advanceFrame(1);
		flushSync();
		expect(blocks[0].textContent).toContain('x = 2');
		expect(blocks[1].textContent).toContain('y = 2');

		manager.next();
		manager.advanceFrame(1);
		flushSync();
		expect(blocks[0].textContent).toContain('x = 2');
		expect(blocks[1].textContent).toContain('y = 3');

		unmount(app);
	});
});
