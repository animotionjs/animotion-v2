import type { Plugin } from './types';

function toggleFullscreen() {
	if (document.fullscreenElement) {
		document.exitFullscreen();
	} else if (document.fullscreenEnabled) {
		document.documentElement.requestFullscreen();
	}
}

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
