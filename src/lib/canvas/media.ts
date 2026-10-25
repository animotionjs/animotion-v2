import { Node, type NodeInit, type NodeState, type Size } from './nodes.js';
import {
	createSignal,
	discreteInterpolate,
	numberSignal,
	stringSignal,
	type Signal
} from './signal.js';

export type MediaFit = 'cover' | 'contain' | 'fill';

interface MediaInit extends NodeInit {
	src: string;
	width?: number | null;
	height?: number | null;
	fit?: MediaFit;
	radius?: number;
}

function drawRounded(ctx: CanvasRenderingContext2D, width: number, height: number, radius: number) {
	const left = -width / 2;
	const top = -height / 2;
	const r = Math.min(radius, width / 2, height / 2);
	ctx.beginPath();
	ctx.moveTo(left + r, top);
	ctx.lineTo(left + width - r, top);
	ctx.quadraticCurveTo(left + width, top, left + width, top + r);
	ctx.lineTo(left + width, top + height - r);
	ctx.quadraticCurveTo(left + width, top + height, left + width - r, top + height);
	ctx.lineTo(left + r, top + height);
	ctx.quadraticCurveTo(left, top + height, left, top + height - r);
	ctx.lineTo(left, top + r);
	ctx.quadraticCurveTo(left, top, left + r, top);
	ctx.closePath();
}

function paintMedia(
	ctx: CanvasRenderingContext2D,
	media: CanvasImageSource,
	sourceWidth: number,
	sourceHeight: number,
	width: number,
	height: number,
	fit: MediaFit
) {
	if (sourceWidth <= 0 || sourceHeight <= 0) return;
	let sx = 0;
	let sy = 0;
	let sw = sourceWidth;
	let sh = sourceHeight;
	let dx = -width / 2;
	let dy = -height / 2;
	let dw = width;
	let dh = height;

	if (fit === 'cover') {
		const sourceRatio = sourceWidth / sourceHeight;
		const boxRatio = width / height;
		if (sourceRatio > boxRatio) {
			sw = sourceHeight * boxRatio;
			sx = (sourceWidth - sw) / 2;
		} else {
			sh = sourceWidth / boxRatio;
			sy = (sourceHeight - sh) / 2;
		}
	} else if (fit === 'contain') {
		const sourceRatio = sourceWidth / sourceHeight;
		const boxRatio = width / height;
		if (sourceRatio > boxRatio) {
			dh = width / sourceRatio;
			dy = -dh / 2;
		} else {
			dw = height * sourceRatio;
			dx = -dw / 2;
		}
	}

	ctx.drawImage(media, sx, sy, sw, sh, dx, dy, dw, dh);
}

export class ImageNode extends Node {
	override readonly kind = 'image';
	readonly src: Signal<string>;
	readonly width: Signal<number | null>;
	readonly height: Signal<number | null>;
	readonly fit: Signal<MediaFit>;
	readonly radius: Signal<number>;
	#image: HTMLImageElement | null = null;
	#failed = false;

	constructor(init: MediaInit) {
		super(init);
		this.src = stringSignal(init.src, `${this.id}.src`);
		this.width = createSignal<number | null>(
			init.width ?? null,
			discreteInterpolate,
			`${this.id}.width`
		);
		this.height = createSignal<number | null>(
			init.height ?? null,
			discreteInterpolate,
			`${this.id}.height`
		);
		this.fit = createSignal(init.fit ?? 'cover', discreteInterpolate, `${this.id}.fit`);
		this.radius = numberSignal(init.radius ?? 0, `${this.id}.radius`);
		this.#load();
	}

	get image(): HTMLImageElement | null {
		return this.#image;
	}

	#load() {
		if (this.#image || this.#failed || typeof Image === 'undefined') return;
		const image = new Image();
		image.decoding = 'async';
		image.onload = () => {
			this.#image = image;
			this.requestDraw();
		};
		image.onerror = () => {
			this.#failed = true;
			this.requestDraw();
		};
		image.src = this.src();
	}

	measure(): Size {
		this.#load();
		const width = this.width();
		const height = this.height();
		const naturalWidth = this.#image?.naturalWidth || 320;
		const naturalHeight = this.#image?.naturalHeight || 180;
		if (width !== null && height !== null) return { width, height };
		if (width !== null) return { width, height: (width * naturalHeight) / naturalWidth };
		if (height !== null) return { width: (height * naturalWidth) / naturalHeight, height };
		return { width: naturalWidth, height: naturalHeight };
	}

	override saveState(): NodeState {
		return {
			...super.saveState(),
			src: this.src(),
			width: this.width(),
			height: this.height(),
			fit: this.fit(),
			radius: this.radius()
		};
	}

	override restoreState(state: NodeState) {
		super.restoreState(state);
		if (typeof state.src === 'string') this.src(state.src);
		if (state.width === null || typeof state.width === 'number') this.width(state.width);
		if (state.height === null || typeof state.height === 'number') this.height(state.height);
		if (typeof state.fit === 'string') this.fit(state.fit as MediaFit);
		if (typeof state.radius === 'number') this.radius(state.radius);
	}

	drawSelf(ctx: CanvasRenderingContext2D) {
		this.#load();
		const size = this.measure();
		drawRounded(ctx, size.width, size.height, this.radius());
		ctx.save();
		ctx.clip();
		if (this.#image) {
			paintMedia(
				ctx,
				this.#image,
				this.#image.naturalWidth,
				this.#image.naturalHeight,
				size.width,
				size.height,
				this.fit()
			);
		} else {
			ctx.fillStyle = '#18181b';
			ctx.fillRect(-size.width / 2, -size.height / 2, size.width, size.height);
		}
		ctx.restore();
	}
}

export class VideoNode extends Node {
	override readonly kind = 'video';
	readonly src: Signal<string>;
	readonly width: Signal<number | null>;
	readonly height: Signal<number | null>;
	readonly fit: Signal<MediaFit>;
	readonly radius: Signal<number>;
	readonly muted: Signal<boolean>;
	readonly loop: Signal<boolean>;
	#video: HTMLVideoElement | null = null;
	#failed = false;
	#lastSync = -1;

	constructor(init: MediaInit & { muted?: boolean; loop?: boolean }) {
		super(init);
		this.src = stringSignal(init.src, `${this.id}.src`);
		this.width = createSignal<number | null>(
			init.width ?? null,
			discreteInterpolate,
			`${this.id}.width`
		);
		this.height = createSignal<number | null>(
			init.height ?? null,
			discreteInterpolate,
			`${this.id}.height`
		);
		this.fit = createSignal(init.fit ?? 'cover', discreteInterpolate, `${this.id}.fit`);
		this.radius = numberSignal(init.radius ?? 0, `${this.id}.radius`);
		this.muted = createSignal(init.muted ?? true, discreteInterpolate, `${this.id}.muted`);
		this.loop = createSignal(init.loop ?? true, discreteInterpolate, `${this.id}.loop`);
		this.#load();
	}

	get video(): HTMLVideoElement | null {
		return this.#video;
	}

	#load() {
		if (this.#video || this.#failed || typeof document === 'undefined') return;
		const video = document.createElement('video');
		video.src = this.src();
		video.muted = this.muted();
		video.loop = this.loop();
		video.playsInline = true;
		video.preload = 'auto';
		video.crossOrigin = 'anonymous';
		video.addEventListener('loadeddata', () => this.requestDraw());
		video.addEventListener('seeked', () => this.requestDraw());
		video.addEventListener('canplay', () => this.requestDraw());
		video.load();
		this.#video = video;
	}

	measure(): Size {
		this.#load();
		const width = this.width();
		const height = this.height();
		const naturalWidth = this.#video?.videoWidth || 640;
		const naturalHeight = this.#video?.videoHeight || 360;
		if (width !== null && height !== null) return { width, height };
		if (width !== null) return { width, height: (width * naturalHeight) / naturalWidth };
		if (height !== null) return { width: (height * naturalWidth) / naturalHeight, height };
		return { width: naturalWidth, height: naturalHeight };
	}

	#sync(time: number) {
		const video = this.#video;
		if (!video) return;
		const duration = Number.isFinite(video.duration) ? video.duration : time;
		const target = this.loop() && duration > 0 ? time % duration : Math.min(time, duration);
		if (Math.abs(target - this.#lastSync) < 1 / 15) return;
		this.#lastSync = target;
		if (Math.abs(video.currentTime - target) > 1 / 20) {
			try {
				video.currentTime = target;
			} catch {
				// the media may still be loading, the next frame retries
			}
		}
	}

	override saveState(): NodeState {
		return {
			...super.saveState(),
			src: this.src(),
			width: this.width(),
			height: this.height(),
			fit: this.fit(),
			radius: this.radius(),
			muted: this.muted(),
			loop: this.loop()
		};
	}

	override restoreState(state: NodeState) {
		super.restoreState(state);
		if (typeof state.src === 'string') this.src(state.src);
		if (state.width === null || typeof state.width === 'number') this.width(state.width);
		if (state.height === null || typeof state.height === 'number') this.height(state.height);
		if (typeof state.fit === 'string') this.fit(state.fit as MediaFit);
		if (typeof state.radius === 'number') this.radius(state.radius);
		if (typeof state.muted === 'boolean') this.muted(state.muted);
		if (typeof state.loop === 'boolean') this.loop(state.loop);
	}

	drawSelf(ctx: CanvasRenderingContext2D, time = 0) {
		this.#load();
		this.#sync(time);
		const size = this.measure();
		drawRounded(ctx, size.width, size.height, this.radius());
		ctx.save();
		ctx.clip();
		const video = this.#video;
		if (video && video.videoWidth > 0) {
			paintMedia(
				ctx,
				video,
				video.videoWidth,
				video.videoHeight,
				size.width,
				size.height,
				this.fit()
			);
		} else {
			ctx.fillStyle = '#18181b';
			ctx.fillRect(-size.width / 2, -size.height / 2, size.width, size.height);
		}
		ctx.restore();
	}
}
