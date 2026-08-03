import { describe, expect, it, beforeEach } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CodeFixture from './fixtures/CodeFixture.svelte';

beforeEach(() => {
	document.body.innerHTML = '';
});

describe('Code line numbers', () => {
	it('renders a gutter with one label per line when lineNumbers is set', () => {
		const app = mount(CodeFixture, {
			target: document.body,
			props: { lineNumbers: true }
		});
		flushSync();

		const pre = document.querySelector('.code-block');
		expect(pre).not.toBeNull();
		expect(pre?.textContent).toContain('alpha');
		expect(pre?.textContent).toContain('1');
		expect(pre?.textContent).toContain('3');

		unmount(app);
	});

	it('omits the gutter when lineNumbers is unset', () => {
		const app = mount(CodeFixture, { target: document.body });
		flushSync();

		const pre = document.querySelector('.code-block');
		expect(pre).not.toBeNull();
		expect(pre?.textContent).toContain('alpha');
		expect(pre?.textContent).not.toContain('1');
		expect(pre?.textContent).not.toContain('3');

		unmount(app);
	});
});
