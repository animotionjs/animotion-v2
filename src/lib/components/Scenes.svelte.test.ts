import { flushSync, mount, unmount } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Scenes from './Scenes.svelte';
import ScenesFixture from './fixtures/ScenesFixture.svelte';
import type { Plugin } from '../plugins/types';
import type { Sequence } from '../scene/runtime/sequence.js';

vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve()),
	afterNavigate: vi.fn(() => () => {}),
	beforeNavigate: vi.fn(() => () => {})
}));

/* No scene param, so the mount takes the named-url redirect path. */
vi.mock('$app/state', () => ({
	page: { params: {}, url: new URL('http://localhost/presentation/banana') }
}));

const sequence: Sequence = [
	{ id: 'intro', order: 1, component: () => Promise.resolve({ default: ScenesFixture }) }
];

function spyPlugin() {
	const setup = vi.fn(() => {});
	const plugin: Plugin = { name: 'spy', setup };
	return { plugin, setup };
}

beforeEach(() => {
	document.body.innerHTML = '';
	vi.clearAllMocks();
});

describe('Scenes plugin lifecycle', () => {
	it('sets plugins up when landing without a scene in the url', async () => {
		const { plugin, setup } = spyPlugin();
		const app = mount(Scenes, {
			target: document.body,
			props: { sequence, plugins: [plugin], base: '/presentation/banana' }
		});
		flushSync();

		/* The redirect is a same-route replace, so this mount is the only one. */
		await vi.waitFor(() => expect(setup).toHaveBeenCalledOnce());

		unmount(app);
	});
});
