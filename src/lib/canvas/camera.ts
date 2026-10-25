import { clamp, easeInOut, lerp, type Easing } from './easing.js';
import { findNode, measureWorld } from './measure.js';
import { Node } from './nodes.js';
import { numberSignal, type Signal } from './signal.js';
import { Animation, type Step } from './steps.js';

export interface CameraState {
	x: number;
	y: number;
	zoom: number;
	deg: number;
}

export type CameraTarget = Node | string | { x?: number; y?: number };

export interface CameraOptions {
	zoom?: number;
	deg?: number;
	duration?: number;
	ease?: Easing;
}

function shortestRotation(from: number, to: number): number {
	return ((to - from + 540) % 360) - 180;
}

export class Camera {
	readonly x: Signal<number> = numberSignal(0, 'camera.x');
	readonly y: Signal<number> = numberSignal(0, 'camera.y');
	readonly zoom: Signal<number> = numberSignal(1, 'camera.zoom');
	readonly deg: Signal<number> = numberSignal(0, 'camera.deg');

	state(): CameraState {
		return { x: this.x(), y: this.y(), zoom: this.zoom(), deg: this.deg() };
	}

	set(state: CameraState) {
		this.x(state.x);
		this.y(state.y);
		this.zoom(state.zoom);
		this.deg(state.deg);
	}
}

class CameraStep implements Step {
	readonly label = 'camera';
	readonly duration: number;
	#root: Node;
	#camera: Camera;
	#target: CameraTarget;
	#options: CameraOptions;
	#ease: Easing;
	#from: CameraState | null = null;
	#to: CameraState | null = null;

	constructor(root: Node, camera: Camera, target: CameraTarget, options: CameraOptions = {}) {
		this.#root = root;
		this.#camera = camera;
		this.#target = target;
		this.#options = options;
		this.duration = options.duration ?? 1.2;
		this.#ease = options.ease ?? easeInOut;
	}

	start() {
		this.#from = this.#camera.state();
		const destination: CameraState = {
			x: this.#from.x,
			y: this.#from.y,
			zoom: this.#options.zoom ?? this.#from.zoom,
			deg: this.#options.deg ?? this.#from.deg
		};

		if (typeof this.#target === 'object' && !(this.#target instanceof Node)) {
			destination.x = this.#target.x ?? destination.x;
			destination.y = this.#target.y ?? destination.y;
		} else {
			const node =
				this.#target instanceof Node ? this.#target : findNode(this.#root, String(this.#target));
			if (!node) throw new Error(`camera target "${String(this.#target)}" was not found`);
			const bounds = measureWorld(this.#root).get(node);
			if (!bounds) throw new Error(`camera target "${node.id}" is not in the scene`);
			destination.x = bounds.x;
			destination.y = bounds.y;
		}

		this.#to = destination;
	}

	setProgress(progress: number) {
		if (!this.#from || !this.#to) return;
		const eased = this.#ease(clamp(progress, 0, 1));
		this.#camera.x(lerp(this.#from.x, this.#to.x, eased));
		this.#camera.y(lerp(this.#from.y, this.#to.y, eased));
		this.#camera.zoom(lerp(this.#from.zoom, this.#to.zoom, eased));
		this.#camera.deg(this.#from.deg + shortestRotation(this.#from.deg, this.#to.deg) * eased);
	}

	end() {
		if (this.#to) this.#camera.set(this.#to);
	}

	revert() {
		if (this.#from) this.#camera.set(this.#from);
		this.#from = null;
		this.#to = null;
	}
}

export function frame(
	root: Node,
	camera: Camera,
	target: CameraTarget,
	options: CameraOptions = {}
): Animation {
	return new Animation(new CameraStep(root, camera, target, options));
}
