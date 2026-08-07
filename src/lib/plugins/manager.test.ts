import { describe, it, expect, vi } from 'vitest';
import { PluginManager } from './manager.svelte';
import type { Plugin, PluginContext } from './types';

function createMockContext(): PluginContext {
	const navigateTo = vi.fn();
	const next = vi.fn();
	const prev = vi.fn();

	return {
		state: {
			sceneId: 'intro',
			sceneIndex: 0,
			totalScenes: 1,
			step: 0,
			totalSteps: 0,
			finished: false
		},
		sequence: [],
		navigateTo,
		next,
		prev
	};
}

function subscribeStepChange() {
	return () => {};
}

describe('PluginManager', () => {
	it('runs setup with the context for every registered plugin', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx, subscribeStepChange);
		const a = vi.fn();
		const b = vi.fn();

		pm.register({ name: 'a', setup: a });
		pm.register({ name: 'b', setup: b });
		pm.setup();

		expect(a).toHaveBeenCalledOnce();
		expect(a).toHaveBeenCalledWith(ctx);
		expect(b).toHaveBeenCalledOnce();
	});

	it('runs setup immediately when registered after the manager is set up', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx, subscribeStepChange);
		const setup = vi.fn();

		pm.setup();
		pm.register({ name: 'test', setup });

		expect(setup).toHaveBeenCalledOnce();
		expect(setup).toHaveBeenCalledWith(ctx);
	});

	it('does not set up twice', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx, subscribeStepChange);
		const setup = vi.fn();
		pm.register({ name: 'test', setup });

		pm.setup();
		pm.setup();

		expect(setup).toHaveBeenCalledOnce();
	});

	it('ignores duplicate plugin names', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx, subscribeStepChange);
		const first = vi.fn();
		const second = vi.fn();

		pm.register({ name: 'test', setup: first });
		pm.setup();

		expect(first).toHaveBeenCalledOnce();
		expect(() => pm.register({ name: 'test', setup: second })).toThrow(
			'A plugin named "test" is already registered'
		);
	});

	it('calls returned cleanup on all plugins', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx, subscribeStepChange);
		const cleanup = vi.fn();

		pm.register({ name: 'test', setup: () => cleanup });
		pm.setup();
		pm.cleanup();

		expect(cleanup).toHaveBeenCalledOnce();
	});

	it('calls returned cleanup on unregister', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx, subscribeStepChange);
		const cleanup = vi.fn();

		const plugin: Plugin = { name: 'test', setup: () => cleanup };
		pm.register(plugin);
		pm.setup();
		pm.unregister(plugin);

		expect(cleanup).toHaveBeenCalledOnce();
	});

	it('forwards onSceneChange to registered plugins', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx, subscribeStepChange);
		const onSceneChange = vi.fn();

		pm.register({ name: 'test', onSceneChange });
		pm.emitSceneChange({ id: 'intro', index: 0 });

		expect(onSceneChange).toHaveBeenCalledOnce();
		expect(onSceneChange).toHaveBeenCalledWith({ id: 'intro', index: 0 });
	});

	it('forwards onStepChange to registered plugins', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx, subscribeStepChange);
		const onStepChange = vi.fn();

		pm.register({ name: 'test', onStepChange });
		pm.emitStepChange(2, 5);

		expect(onStepChange).toHaveBeenCalledOnce();
		expect(onStepChange).toHaveBeenCalledWith(2, 5);
	});

	it('stops keyboard handling when a plugin returns true', () => {
		const ctx = createMockContext();
		const pm = new PluginManager(ctx, subscribeStepChange);
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
		const pm = new PluginManager(ctx, subscribeStepChange);
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
