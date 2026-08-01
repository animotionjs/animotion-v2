import { describe, expect, it, beforeEach } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import LayoutReveal from './fixtures/LayoutReveal.svelte';

beforeEach(() => {
	document.body.innerHTML = '';
});

describe('layout reveal of a Code block', () => {
	it('mounts the {#if}-revealed Code without crashing and renders its content', () => {
		const app = mount(LayoutReveal, { target: document.body });
		flushSync();

		const pre = document.querySelector('.code-block');
		expect(pre).not.toBeNull();
		expect(pre?.textContent).toContain('const');

		unmount(app);
	});
});
