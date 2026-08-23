/** The camera's position and framing in canvas coordinates. */
export interface Camera {
	x: number;
	y: number;
	zoom: number;
	deg: number;
}

/**
 * The canvas-space point a flight must center on to frame the element.
 *
 * The element's screen offset already includes the current rotation, because
 * its `canvas.left` term cancels the camera position, so it is un-rotated back
 * into canvas space before use.
 */
export function frameCenter(
	canvas: DOMRect,
	element: DOMRect,
	camera: Camera
): { x: number; y: number } {
	const sx = ((element.left + element.right) / 2 - canvas.left) / camera.zoom;
	const sy = ((element.top + element.bottom) / 2 - canvas.top) / camera.zoom;

	// Undo the camera's rotation so the destination reads as canvas coordinates,
	// which is what the transform string consumes.
	const rad = (camera.deg * Math.PI) / 180;
	return {
		x: sx * Math.cos(rad) + sy * Math.sin(rad),
		y: -sx * Math.sin(rad) + sy * Math.cos(rad)
	};
}
