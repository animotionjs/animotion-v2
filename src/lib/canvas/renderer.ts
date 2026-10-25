import type { SceneInstance, TransitionState } from './scene.js';

export interface RendererOptions {
	width?: number;
	height?: number;
	/** Background fill, or `null` to leave the canvas transparent. */
	background?: string | null;
}

const IDENTITY: TransitionState = { opacity: 1, x: 0, y: 0, scale: 1 };

export class CanvasRenderer {
	readonly width: number;
	readonly height: number;
	readonly background: string | null;
	#canvas: HTMLCanvasElement;
	#scene: SceneInstance;
	#ctx: CanvasRenderingContext2D;
	#fit = 1;
	#density = 1;

	constructor(canvas: HTMLCanvasElement, scene: SceneInstance, options: RendererOptions = {}) {
		this.#canvas = canvas;
		this.#scene = scene;
		this.width = options.width ?? 1920;
		this.height = options.height ?? 1080;
		this.background = options.background === undefined ? '#09090b' : options.background;

		this.resize();

		const context = canvas.getContext('2d');
		if (!context) throw new Error('CanvasRenderer requires a 2D canvas context.');
		this.#ctx = context;
	}

	/** Matches the backing store to the canvas's on-screen size. */
	resize() {
		const cssWidth = this.#canvas.clientWidth > 0 ? this.#canvas.clientWidth : this.width;
		const cssHeight = this.#canvas.clientHeight > 0 ? this.#canvas.clientHeight : this.height;
		const fit = cssWidth / this.width;
		const density = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
		const pixelWidth = Math.max(1, Math.round(cssWidth * density));
		const pixelHeight = Math.max(1, Math.round(cssHeight * density));

		if (
			Math.abs(fit - this.#fit) < 1e-6 &&
			Math.abs(density - this.#density) < 1e-6 &&
			this.#canvas.width === pixelWidth &&
			this.#canvas.height === pixelHeight
		) {
			return;
		}

		this.#fit = fit;
		this.#density = density;
		this.#canvas.width = pixelWidth;
		this.#canvas.height = pixelHeight;
	}

	draw(time = 0) {
		this.begin();
		this.drawScene(this.#scene, time);
		this.end();
	}

	begin() {
		const ctx = this.#ctx;
		const cssWidth = this.#canvas.clientWidth > 0 ? this.#canvas.clientWidth : this.width;
		const cssHeight = this.#canvas.clientHeight > 0 ? this.#canvas.clientHeight : this.height;
		const visibleWidth = cssWidth / this.#fit;
		const visibleHeight = cssHeight / this.#fit;
		const scale = this.#fit * this.#density;

		ctx.setTransform(scale, 0, 0, scale, 0, 0);
		ctx.clearRect(0, 0, visibleWidth, visibleHeight);
		if (this.background !== null) {
			ctx.fillStyle = this.background;
			ctx.fillRect(0, 0, visibleWidth, visibleHeight);
		}
		ctx.save();
		ctx.translate(visibleWidth / 2, visibleHeight / 2);
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
