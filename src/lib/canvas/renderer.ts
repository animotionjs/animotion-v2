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
	scale: number;
	#canvas: HTMLCanvasElement;
	#scene: SceneInstance;
	#ctx: CanvasRenderingContext2D;

	constructor(canvas: HTMLCanvasElement, scene: SceneInstance, options: RendererOptions = {}) {
		this.#canvas = canvas;
		this.#scene = scene;
		this.width = options.width ?? 1920;
		this.height = options.height ?? 1080;
		this.background = options.background === undefined ? '#09090b' : options.background;
		this.scale = 1;

		if (canvas.width !== this.width) canvas.width = this.width;
		if (canvas.height !== this.height) canvas.height = this.height;

		const context = canvas.getContext('2d');
		if (!context) throw new Error('CanvasRenderer requires a 2D canvas context.');
		this.#ctx = context;

		this.resize();
	}

	/** Matches the backing store to the canvas's on-screen size. */
	resize() {
		const density = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
		let available = this.width;
		if (this.#canvas.clientWidth > 0) available = this.#canvas.clientWidth;
		else if (typeof window !== 'undefined') available = window.innerWidth;
		const shown = available / this.width;
		const scale = Math.max(0.1, shown * density);
		if (Math.abs(scale - this.scale) < 1e-6) return;

		this.scale = scale;
		const pixelWidth = Math.max(1, Math.round(this.width * scale));
		const pixelHeight = Math.max(1, Math.round(this.height * scale));
		if (this.#canvas.width !== pixelWidth) this.#canvas.width = pixelWidth;
		if (this.#canvas.height !== pixelHeight) this.#canvas.height = pixelHeight;
	}

	draw(time = 0) {
		this.begin();
		this.drawScene(this.#scene, time);
		this.end();
	}

	begin() {
		const ctx = this.#ctx;
		ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
		ctx.clearRect(0, 0, this.width, this.height);
		if (this.background !== null) {
			ctx.fillStyle = this.background;
			ctx.fillRect(0, 0, this.width, this.height);
		}
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
