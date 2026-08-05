import type { Plugin, PluginContext } from './types';

/** Registers and dispatches to a set of plugins. */
export class PluginManager {
	#plugins: Plugin[] = [];
	#context: PluginContext;
	#unsubStepChange: (() => void) | null = null;

	constructor(context: PluginContext) {
		this.#context = context;
	}

	/** Registers `plugin` and runs its `init` hook. */
	register(plugin: Plugin) {
		this.#plugins.push(plugin);
		plugin.init?.(this.#context);
	}

	/** Unregisters `plugin` and runs its `cleanup` hook if present. */
	unregister(plugin: Plugin) {
		const idx = this.#plugins.indexOf(plugin);
		if (idx !== -1) {
			this.#plugins.splice(idx, 1);
			plugin.cleanup?.();
		}
	}

	/** Wires step-change events to plugins and runs each `setup` hook. */
	setup() {
		this.#unsubStepChange = this.#context.manager.onStepChange((step, total) => {
			this.emitStepChange(step, total);
		});

		for (const plugin of this.#plugins) {
			plugin.setup?.();
		}
	}

	/** Unwires events, runs each `cleanup` hook, and clears the plugin list. */
	cleanup() {
		this.#unsubStepChange?.();
		this.#unsubStepChange = null;

		for (const plugin of this.#plugins) {
			plugin.cleanup?.();
		}

		this.#plugins = [];
	}

	/** Dispatches a scene-change event to all plugins. */
	emitSceneChange(scene: { id: string; index: number }) {
		for (const plugin of this.#plugins) {
			plugin.onSceneChange?.(scene);
		}
	}

	/** Dispatches a step-change event to all plugins. */
	emitStepChange(step: number, total: number) {
		for (const plugin of this.#plugins) {
			plugin.onStepChange?.(step, total);
		}
	}

	/**
	 * Dispatches a keydown event to all plugins.
	 *
	 * @returns `true` if a plugin consumed the event
	 */
	handleKeydown(event: KeyboardEvent): boolean {
		for (const plugin of this.#plugins) {
			const result = plugin.onKeydown?.(event);
			if (result === true) return true;
		}
		return false;
	}
}
