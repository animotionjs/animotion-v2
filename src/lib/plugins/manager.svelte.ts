import type { Plugin, PluginContext } from './types';

export class PluginManager {
	#plugins: Plugin[] = [];
	#context: PluginContext;
	#unsubStepChange: (() => void) | null = null;

	constructor(context: PluginContext) {
		this.#context = context;
	}

	register(plugin: Plugin) {
		this.#plugins.push(plugin);
		plugin.init?.(this.#context);
	}

	unregister(plugin: Plugin) {
		const idx = this.#plugins.indexOf(plugin);
		if (idx !== -1) {
			this.#plugins.splice(idx, 1);
			plugin.cleanup?.();
		}
	}

	setup() {
		this.#unsubStepChange = this.#context.manager.onStepChange((step, total) => {
			this.emitStepChange(step, total);
		});

		for (const plugin of this.#plugins) {
			plugin.setup?.();
		}
	}

	cleanup() {
		this.#unsubStepChange?.();
		this.#unsubStepChange = null;

		for (const plugin of this.#plugins) {
			plugin.cleanup?.();
		}

		this.#plugins = [];
	}

	emitSlideChange(slide: { slug: string; index: number }) {
		for (const plugin of this.#plugins) {
			plugin.onSlideChange?.(slide);
		}
	}

	emitStepChange(step: number, total: number) {
		for (const plugin of this.#plugins) {
			plugin.onStepChange?.(step, total);
		}
	}

	handleKeydown(event: KeyboardEvent): boolean {
		for (const plugin of this.#plugins) {
			const result = plugin.onKeydown?.(event);
			if (result === true) return true;
		}
		return false;
	}
}
