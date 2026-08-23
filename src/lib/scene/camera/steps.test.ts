import { describe, expect, it } from 'vitest';
import { CameraStep } from './steps';
import type { Camera } from './frame';

const linear = (p: number) => p;

describe('CameraStep', () => {
	it('flies every field toward the destination', () => {
		const camera: Camera = { x: 0, y: 0, zoom: 1, deg: 0 };
		const step = new CameraStep(camera, { x: 100, y: -40 }, { zoom: 2, ease: linear });

		step.start();
		step.setProgress(0.5);

		expect(camera.x).toBeCloseTo(50);
		expect(camera.y).toBeCloseTo(-20);
		expect(camera.zoom).toBeCloseTo(1.5);
		expect(camera.deg).toBe(0);
	});

	it('keeps whatever the options leave out', () => {
		const camera: Camera = { x: 10, y: 20, zoom: 1.5, deg: 45 };
		const step = new CameraStep(camera, {}, { ease: linear });

		step.start();
		step.setProgress(1);

		expect(camera.x).toBe(10);
		expect(camera.y).toBe(20);
		expect(camera.zoom).toBeCloseTo(1.5);
		expect(camera.deg).toBe(45);
	});

	it('turns rotation the short way around', () => {
		const camera: Camera = { x: 0, y: 0, zoom: 1, deg: 350 };
		const step = new CameraStep(camera, {}, { deg: 10, ease: linear });

		step.start();
		step.setProgress(0.5);

		expect(camera.deg).toBeCloseTo(360);
	});

	it('measures fresh on every start, so replays fly from where they are', () => {
		const camera: Camera = { x: 0, y: 0, zoom: 1, deg: 0 };
		const step = new CameraStep(camera, { x: 100 }, { ease: linear });

		step.start();
		step.setProgress(1);
		step.revert();
		step.start();
		step.setProgress(0.25);

		expect(camera.x).toBeCloseTo(25);
	});

	it('revert restores the pre-flight camera', () => {
		const camera: Camera = { x: 5, y: 6, zoom: 1.2, deg: 30 };
		const step = new CameraStep(camera, { x: 100 }, { deg: 90, ease: linear });

		step.start();
		step.setProgress(0.5);
		step.revert();

		expect(camera.x).toBe(5);
		expect(camera.deg).toBe(30);
	});

	it('end commits the destination', () => {
		const camera: Camera = { x: 0, y: 0, zoom: 1, deg: 0 };
		const step = new CameraStep(camera, { x: 80 }, { zoom: 2, ease: linear });

		step.start();
		step.end();

		expect(camera.x).toBe(80);
		expect(camera.zoom).toBe(2);
	});

	it('refuses to frame an element when no <Camera> is mounted', () => {
		const step = new CameraStep({ x: 0, y: 0, zoom: 1, deg: 0 }, 'pan');

		expect(() => step.start()).toThrow(/<Camera>/);
	});
});
