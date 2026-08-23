let canvas: HTMLElement | null = null;

/**
 * The `<Camera>` component's canvas element, published so camera steps can
 * measure framed elements. `null` means no camera is currently mounted.
 */
export function getCanvas(): HTMLElement | null {
	return canvas;
}

/** Publishes (or clears) the canvas for the camera steps to measure against. */
export function setCanvas(element: HTMLElement | null) {
	canvas = element;
}
