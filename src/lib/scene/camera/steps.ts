import { clamp, easeInOut, lerp, type Easing } from '../easing';
import { getCanvas } from './context';
import { frameCenter, type Camera } from './frame';
import type { Step } from '../runtime/steps';

/**
 * Where a flight heads: the `data-frame` id of an element on the canvas, or
 * explicit canvas coordinates.
 */
export type CameraTarget = string | { x?: number; y?: number };

/** Per-flight overrides. Anything left out keeps its current value. */
export interface CameraOptions {
	/** Target zoom level. */
	zoom?: number;
	/** Target rotation in degrees; the camera always turns the short way around. */
	deg?: number;
	/** Flight length in seconds. Defaults to `1.4`. */
	duration?: number;
	/** Easing applied to every field of the flight. Defaults to `easeInOut`. */
	ease?: Easing;
}

/** Rotation takes the short way around so a flight never spins the long way. */
function shortestRotation(from: number, to: number): number {
	return ((to - from + 540) % 360) - 180;
}

/**
 * Flies the camera from wherever it is to a resolved destination. The
 * destination is measured when the step starts rather than when it is built,
 * so scrubbing back and replaying always frames the element where it actually
 * sits at that point in the timeline.
 */
export class CameraStep implements Step {
	#camera: Camera;
	#target: CameraTarget;
	#options: CameraOptions;
	#duration: number;
	#ease: Easing;
	#from: Camera | null = null;
	#to: Camera | null = null;

	constructor(cameraState: Camera, target: CameraTarget, options: CameraOptions = {}) {
		this.#camera = cameraState;
		this.#target = target;
		this.#options = options;
		this.#duration = options.duration ?? 1.4;
		this.#ease = options.ease ?? easeInOut;
		if (!Number.isFinite(this.#duration) || this.#duration < 0) {
			throw new RangeError('CameraStep duration must be a non-negative finite number.');
		}
	}

	get duration(): number {
		return this.#duration;
	}

	start() {
		this.#from = { ...this.#camera };
		this.#to = this.#resolveDestination();
	}

	setProgress(p: number) {
		if (!this.#from || !this.#to) return;
		const eased = this.#ease(clamp(p, 0, 1));
		this.#camera.x = lerp(this.#from.x, this.#to.x, eased);
		this.#camera.y = lerp(this.#from.y, this.#to.y, eased);
		this.#camera.zoom = lerp(this.#from.zoom, this.#to.zoom, eased);
		this.#camera.deg = this.#from.deg + shortestRotation(this.#from.deg, this.#to.deg) * eased;
	}

	end() {
		if (!this.#started() || !this.#to) return;
		Object.assign(this.#camera, this.#to);
	}

	revert() {
		if (!this.#started() || !this.#from) return;
		Object.assign(this.#camera, this.#from);
		this.#from = null;
		this.#to = null;
	}

	#started(): boolean {
		return this.#from !== null;
	}

	#resolveDestination(): Camera {
		const options = this.#options;
		const destination: Camera = {
			x: typeof this.#target === 'object' ? (this.#target.x ?? this.#camera.x) : this.#camera.x,
			y: typeof this.#target === 'object' ? (this.#target.y ?? this.#camera.y) : this.#camera.y,
			zoom: options.zoom ?? this.#camera.zoom,
			deg: options.deg ?? this.#camera.deg
		};

		if (typeof this.#target !== 'string') return destination;

		const canvas = getCanvas();
		if (!canvas) {
			throw new Error(
				`camera: no <Camera> component is mounted, so "${this.#target}" cannot be framed.`
			);
		}
		const element = canvas.querySelector(`[data-frame="${this.#target}"]`);
		if (!element) {
			throw new Error(`camera: no [data-frame="${this.#target}"] element exists on the canvas.`);
		}
		const center = frameCenter(
			canvas.getBoundingClientRect(),
			element.getBoundingClientRect(),
			this.#camera
		);
		return { ...destination, ...center };
	}
}
