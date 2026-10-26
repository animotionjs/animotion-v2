import { ImageNode, type MediaFit } from './media.js';
import type { NodeInit } from './nodes.js';

export interface SvgInit extends NodeInit {
	/** URL of an SVG file. */
	src?: string;
	/** Inline SVG markup. */
	markup?: string;
	width?: number | null;
	height?: number | null;
	fit?: MediaFit;
	radius?: number;
	smoothness?: number;
	smoothing?: boolean;
}

function svgDataUrl(markup: string): string {
	const source = markup.includes('xmlns=')
		? markup
		: markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

function withSize(markup: string, width?: number | null, height?: number | null): string {
	const start = markup.indexOf('<svg');
	if (start === -1) return markup;
	const end = markup.indexOf('>', start);
	if (end === -1) return markup;
	let tag = markup.slice(start, end + 1);

	const viewBox = tag.match(/viewBox="([^"]+)"/);
	const parts = viewBox?.[1].split(/\s+/).map(Number);
	const ratio = parts && parts[2] && parts[3] ? parts[2]! / parts[3]! : 16 / 9;
	const targetWidth = width ?? (height != null ? height * ratio : 320);
	const targetHeight = height ?? targetWidth / ratio;

	if (!/\swidth=/.test(tag)) {
		tag = tag.replace('<svg', `<svg width="${Math.round(targetWidth)}"`);
	}
	if (!/\sheight=/.test(tag)) {
		tag = tag.replace('<svg', `<svg height="${Math.round(targetHeight)}"`);
	}
	return markup.slice(0, start) + tag + markup.slice(end + 1);
}

/** Draws an SVG asset or inline markup through the canvas image pipeline. */
export class SvgNode extends ImageNode {
	override readonly kind = 'svg';

	constructor(init: SvgInit) {
		if (!init.src && !init.markup) {
			throw new Error('An svg node needs a src or markup.');
		}
		super({
			...init,
			src:
				init.src ?? svgDataUrl(withSize(init.markup ?? '', init.width ?? null, init.height ?? null))
		});
	}
}
