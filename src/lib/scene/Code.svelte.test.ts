import { describe, expect, it, beforeEach } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CodeFixture from './fixtures/CodeFixture.svelte';
import CodeScrollAppendFixture from './fixtures/CodeScrollAppendFixture.svelte';
import CodeScrollFixture from './fixtures/CodeScrollFixture.svelte';
import { managers } from './fixtures/code-scroll-managers.js';
import { whenReady } from './highlighter';
import type { SceneManager } from './runtime.svelte.js';

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

function maskOf(element: HTMLElement): string {
	const styles = getComputedStyle(element);
	return styles.maskImage !== 'none'
		? styles.maskImage
		: styles.getPropertyValue('-webkit-mask-image');
}

function drive(manager: SceneManager, frames = 10) {
	for (let i = 0; i < frames; i++) manager.advanceFrame(0.1);
	flushSync();
}

describe('Code scrolling and masking', () => {
	it('masks overflowing content and reveals appended lines', async () => {
		await whenReady();
		const app = mount(CodeScrollFixture, { target: document.body });
		flushSync();

		const manager = managers.at(-1)!;
		manager.enableRenderMode();
		manager.next();
		manager.advanceFrame(0.1);
		flushSync();

		let codeBlock = document.querySelector('.code-block') as HTMLElement;
		expect(maskOf(codeBlock)).toBe('none');

		drive(manager);

		codeBlock = document.querySelector('.code-block') as HTMLElement;
		expect(maskOf(codeBlock)).toContain('linear-gradient');
		expect(codeBlock.scrollTop).toBeGreaterThan(0);

		unmount(app);
	});

	it('does not reverse the reveal scroll while the code grows', async () => {
		await whenReady();
		const app = mount(CodeScrollFixture, { target: document.body });
		flushSync();

		const manager = managers.at(-1)!;
		manager.enableRenderMode();
		manager.next();
		const positions: number[] = [];
		for (let i = 0; i < 8; i++) {
			manager.advanceFrame(0.1);
			flushSync();
			positions.push((document.querySelector('.code-block') as HTMLElement).scrollTop);
		}

		for (let i = 1; i < positions.length; i++) {
			expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
		}
		unmount(app);
	});

	it('scrolls back to the first selection', async () => {
		await whenReady();
		const app = mount(CodeScrollFixture, { target: document.body });
		flushSync();

		const manager = managers.at(-1)!;
		manager.enableRenderMode();
		manager.next();
		drive(manager);
		const codeBlock = document.querySelector('.code-block') as HTMLElement;
		expect(codeBlock.scrollTop).toBeGreaterThan(0);

		manager.next();
		drive(manager);
		expect(codeBlock.scrollTop).toBeLessThan(4);

		unmount(app);
	});

	it('does not scroll when scrolling is disabled', async () => {
		await whenReady();
		const app = mount(CodeScrollFixture, {
			target: document.body,
			props: { scrollMode: 'none' }
		});
		flushSync();

		const manager = managers.at(-1)!;
		manager.enableRenderMode();
		manager.next();
		drive(manager);

		const codeBlock = document.querySelector('.code-block') as HTMLElement;
		expect(codeBlock.scrollTop).toBe(0);
		unmount(app);
	});

	it('keeps the mask visible while appending more code after overflow', async () => {
		await whenReady();
		const app = mount(CodeScrollAppendFixture, { target: document.body });
		flushSync();

		const manager = managers.at(-1)!;
		manager.enableRenderMode();

		manager.next();
		drive(manager);
		const codeBlock = document.querySelector('.code-block') as HTMLElement;
		expect(maskOf(codeBlock)).toContain('linear-gradient');

		manager.next();
		manager.advanceFrame(0.2);
		flushSync();
		expect(maskOf(codeBlock)).toContain('linear-gradient');

		drive(manager);
		expect(maskOf(codeBlock)).toContain('linear-gradient');
		unmount(app);
	});
});
