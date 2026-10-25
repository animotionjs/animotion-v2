import type { SceneInstance, TransitionState } from './scene.js';

export interface RendererOptions {
	width?: number;
	height?: number;
	background?: string;
}

const IDENTITY: TransitionState = { opacity: 1, x: 0, y: 0, scale: 1 };

export class CanvasRenderer {
	readonly width: number;
	readonly height: number;
	readonly background: string;
	#canvas: HTMLCanvasElement;
	#scene: SceneInstance;
	#ctx: CanvasRenderingContext2D;

	constructor(canvas: HTMLCanvasElement, scene: SceneInstance, options: RendererOptions = {}) {
		this.#canvas = canvas;
		this.#scene = scene;
		this.width = options.width ?? 1920;
		this.height = options.height ?? 1080;
		this.background = options.background ?? '#09090b';

		if (canvas.width !== this.width) canvas.width = this.width;
		if (canvas.height !== this.height) canvas.height = this.height;

		const context = canvas.getContext('2d');
		if (!context) throw new Error('CanvasRenderer requires a 2D canvas context.');
		this.#ctx = context;
	}

	draw(time = 0) {
		this.begin();
		this.drawScene(this.#scene, time);
		this.end();
	}

	begin() {
		const ctx = this.#ctx;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, this.width, this.height);
		ctx.fillStyle = this.background;
		ctx.fillRect(0, 0, this.width, this.height);
		ctx.save();
		ctx.translate(this.width / 2, this.height / 2);
	}

	drawScene(scene: SceneInstance, time: number, transition: TransitionState = IDENTITY) {
		scene.seek(time);
		scene.draw(this.#ctx, transition);
	}

	end() {
		this.#ctx.restore();
	}

	get canvas(): HTMLCanvasElement {
		return this.#canvas;
	}

	get context(): CanvasRenderingContext2D {
		return this.#ctx;
	}
}
