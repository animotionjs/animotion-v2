import { describe, expect, it } from 'vitest';
import { frameCenter, type Camera } from './frame';

/** A plain object shaped like the DOMRect parts `frameCenter` reads. */
function rect(left: number, top: number, right: number, bottom: number): DOMRect {
	return {
		left,
		top,
		right,
		bottom,
		width: right - left,
		height: bottom - top,
		x: left,
		y: top
	} as DOMRect;
}

const canvas = rect(0, 0, 1000, 1000);
const identity: Camera = { x: 0, y: 0, zoom: 1, deg: 0 };

describe('frameCenter', () => {
	it('returns the element screen center for an untransformed camera', () => {
		expect(frameCenter(canvas, rect(400, 400, 600, 600), identity)).toEqual({ x: 500, y: 500 });
	});

	it('divides the screen offset by the zoom', () => {
		const camera = { ...identity, zoom: 2 };
		expect(frameCenter(canvas, rect(700, 300, 900, 500), camera)).toEqual({ x: 400, y: 200 });
	});

	it('un-rotates the screen offset into canvas space', () => {
		/*
			A 90deg camera maps canvas (x, y) onto screen (-y, x), so a flight to
			screen (600, 800) must head for canvas (800, -600).
		*/
		const camera = { ...identity, deg: 90 };
		expect(frameCenter(canvas, rect(500, 700, 700, 900), camera)).toEqual({ x: 800, y: -600 });
	});
});
