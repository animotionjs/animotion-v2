import { SvelteMap } from 'svelte/reactivity';
import type { Plugin, PluginContext } from './types';

export type StepChangeSubscribe = (listener: (step: number, total: number) => void) => () => void;

/** Registers and dispatches to a set of plugins. */
export class PluginManager {
	#plugins: Plugin[] = [];
	#context: PluginContext;
	#subscribeStepChange: StepChangeSubscribe;
	#unsubStepChange: (() => void) | null = null;
	#cleanups = new SvelteMap<Plugin, () => void>();
	#setup = false;

	constructor(context: PluginContext, subscribeStepChange: StepChangeSubscribe) {
		this.#context = context;
		this.#subscribeStepChange = subscribeStepChange;
	}

	/**
	 * Registers `plugin`. If the manager is already set up, runs the plugin's
	 * `setup` hook immediately; otherwise it runs with the rest on {@link setup}.
	 */
	register(plugin: Plugin) {
		if (this.#plugins.some((registered) => registered.name === plugin.name)) {
			throw new Error(`A plugin named "${plugin.name}" is already registered`);
		}
		this.#plugins.push(plugin);
		if (this.#setup) this.#setupPlugin(plugin);
	}

	/** Unregisters `plugin` and runs the cleanup returned by its setup hook. */
	unregister(plugin: Plugin) {
		const idx = this.#plugins.indexOf(plugin);
		if (idx !== -1) {
			this.#plugins.splice(idx, 1);
			this.#cleanPlugin(plugin);
		}
	}

	/** Wires step-change events to plugins and runs each `setup` hook. */
	setup() {
		if (this.#setup) return;
		this.#setup = true;

		this.#unsubStepChange = this.#subscribeStepChange((step, total) => {
			this.emitStepChange(step, total);
		});

		for (const plugin of this.#plugins) {
			this.#setupPlugin(plugin);
		}
	}

	/** Unwires events, runs each plugin cleanup, and clears the plugin list. */
	cleanup() {
		this.#setup = false;

		this.#unsubStepChange?.();
		this.#unsubStepChange = null;

		for (const plugin of this.#plugins) {
			this.#cleanPlugin(plugin);
		}

		this.#plugins = [];
	}

	#setupPlugin(plugin: Plugin) {
		const cleanup = plugin.setup?.(this.#context);
		if (cleanup) this.#cleanups.set(plugin, cleanup);
	}

	#cleanPlugin(plugin: Plugin) {
		this.#cleanups.get(plugin)?.();
		this.#cleanups.delete(plugin);
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
