import type { SceneInstance, TransitionState } from './scene.js';

export interface RendererOptions {
	width?: number;
	height?: number;
	/** Background fill, or `null` to leave the canvas transparent. */
	background?: string | null;
	/** Backing-store pixels per logical unit. Defaults to the canvas's on-screen density. */
	scale?: number;
}

const IDENTITY: TransitionState = { opacity: 1, x: 0, y: 0, scale: 1 };

export class CanvasRenderer {
	readonly width: number;
	readonly height: number;
	readonly background: string | null;
	readonly scale: number;
	#canvas: HTMLCanvasElement;
	#scene: SceneInstance;
	#ctx: CanvasRenderingContext2D;

	constructor(canvas: HTMLCanvasElement, scene: SceneInstance, options: RendererOptions = {}) {
		this.#canvas = canvas;
		this.#scene = scene;
		this.width = options.width ?? 1920;
		this.height = options.height ?? 1080;
		this.background = options.background === undefined ? '#09090b' : options.background;

		if (canvas.width !== this.width) canvas.width = this.width;
		if (canvas.height !== this.height) canvas.height = this.height;

		const density = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
		let available = this.width;
		if (canvas.clientWidth > 0) available = canvas.clientWidth;
		else if (typeof window !== 'undefined') available = window.innerWidth;
		const shown = available / this.width;
		this.scale = options.scale ?? Math.max(1, shown * density);

		const pixelWidth = Math.max(1, Math.round(this.width * this.scale));
		const pixelHeight = Math.max(1, Math.round(this.height * this.scale));
		if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
		if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

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
