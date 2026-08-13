import { describe, expect, it, beforeEach } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LayoutReveal, { manager } from './fixtures/LayoutReveal.svelte';

beforeEach(() => {
	document.body.innerHTML = '';
});

describe('layout reveal of a Code block', () => {
	it('plays the layout step that reveals a Code block without crashing', () => {
		const app = mount(LayoutReveal, { target: document.body });
		flushSync();

		expect(document.querySelector('.code-block')).toBeNull();

		manager.next();
		flushSync();

		const pre = document.querySelector('.code-block');
		expect(pre).not.toBeNull();
		expect(pre?.textContent).toContain('const');

		unmount(app);
	});
});
