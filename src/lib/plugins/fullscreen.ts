import type { Plugin } from './types';

function toggleFullscreen() {
	if (document.fullscreenElement) {
		document.exitFullscreen();
	} else if (document.fullscreenEnabled) {
		document.documentElement.requestFullscreen();
	}
}

/**
 * Toggles fullscreen when the `f` key is pressed (no modifiers other than
 * Shift). Register via `PluginManager.register` or the `plugins` prop of
 * `<Scenes>`.
 */
export function fullscreenPlugin(): Plugin {
	return {
		name: 'fullscreen',
		onKeydown(event) {
			if (event.key !== 'f' || event.metaKey || event.ctrlKey || event.altKey || event.repeat) {
				return;
			}
			toggleFullscreen();
			return true;
		}
	};
}
