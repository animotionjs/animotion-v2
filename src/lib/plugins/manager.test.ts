import { describe, it, expect, vi } from 'vitest';
import { PluginManager } from './manager.svelte';
import type { Plugin, PluginContext } from './types';

function createMockContext(): PluginContext {
	const navigateTo = vi.fn();
	const next = vi.fn();
	const prev = vi.fn();

	const manager = {
		onStepChange: vi.fn(() => {
			return () => {};
		})
	} as unknown as PluginContext['manager'];

	return { manager, deck: [], navigateTo, next, prev };
}

describe('PluginManager', () => {
	it('calls init when plugin is registered', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx);
		const init = vi.fn();

		const plugin: Plugin = { name: 'test', init };
		pm.register(plugin);

		expect(init).toHaveBeenCalledOnce();
		expect(init).toHaveBeenCalledWith(ctx);
	});

	it('calls setup on all plugins', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx);
		const setup = vi.fn();

		pm.register({ name: 'test', setup });
		pm.setup();

		expect(setup).toHaveBeenCalledOnce();
	});

	it('calls cleanup on all plugins', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx);
		const cleanup = vi.fn();

		pm.register({ name: 'test', cleanup });
		pm.cleanup();

		expect(cleanup).toHaveBeenCalledOnce();
	});

	it('calls cleanup on unregister', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx);
		const cleanup = vi.fn();

		const plugin: Plugin = { name: 'test', cleanup };
		pm.register(plugin);
		pm.unregister(plugin);

		expect(cleanup).toHaveBeenCalledOnce();
	});

	it('forwards onSlideChange to registered plugins', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx);
		const onSlideChange = vi.fn();

		pm.register({ name: 'test', onSlideChange });
		pm.emitSlideChange({ slug: 'intro', index: 0 });

		expect(onSlideChange).toHaveBeenCalledOnce();
		expect(onSlideChange).toHaveBeenCalledWith({ slug: 'intro', index: 0 });
	});

	it('forwards onStepChange to registered plugins', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx);
		const onStepChange = vi.fn();

		pm.register({ name: 'test', onStepChange });
		pm.emitStepChange(2, 5);

		expect(onStepChange).toHaveBeenCalledOnce();
		expect(onStepChange).toHaveBeenCalledWith(2, 5);
	});

	it('stops keyboard handling when a plugin returns true', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx);
		const onKeydown1 = vi.fn(() => true);
		const onKeydown2 = vi.fn();

		pm.register({ name: 'a', onKeydown: onKeydown1 });
		pm.register({ name: 'b', onKeydown: onKeydown2 });

		const event = { key: 'g', ctrlKey: true, metaKey: false } as KeyboardEvent;
		const result = pm.handleKeydown(event);

		expect(result).toBe(true);
		expect(onKeydown1).toHaveBeenCalledOnce();
		expect(onKeydown2).not.toHaveBeenCalled();
	});

	it('continues to next plugin when keydown returns undefined', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx);
		const onKeydown1 = vi.fn();
		const onKeydown2 = vi.fn(() => true);

		pm.register({ name: 'a', onKeydown: onKeydown1 });
		pm.register({ name: 'b', onKeydown: onKeydown2 });

		const event = { key: 'g', ctrlKey: true, metaKey: false } as KeyboardEvent;
		const result = pm.handleKeydown(event);

		expect(result).toBe(true);
		expect(onKeydown1).toHaveBeenCalledOnce();
		expect(onKeydown2).toHaveBeenCalledOnce();
	});
});
