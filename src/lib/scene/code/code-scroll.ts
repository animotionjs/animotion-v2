import { clamp } from '../easing';
import type { CodeRange } from './code.svelte';
import type { MorphToken } from './highlighter';

/**
 * Which viewport edge(s) need a fade mask: `'top'` fades the top edge,
 * `'bottom'` the bottom edge, `'both'` both, `'none'` neither.
 */
export type ScrollMask = 'none' | 'top' | 'bottom' | 'both';

/**
 * Returns the 0-indexed bottom line of the content newly created by a morph,
 * or `null` if the morph creates nothing.
 */
export function revealTargetLine(tokens: MorphToken[]): number | null {
	let bottom = -1;
	for (const token of tokens) {
		if (token.morph !== 'create' || token.to === null) continue;
		bottom = Math.max(bottom, token.to[1] + token.code.split('\n').length);
	}
	return bottom < 0 ? null : bottom;
}

function selectionLines(selection: CodeRange[], lineCount: number) {
	if (selection.length === 0 || lineCount <= 0) return null;

	let top = Infinity;
	let bottom = -Infinity;
	for (const [[startLine], [endLine]] of selection) {
		top = Math.min(top, startLine);
		bottom = Math.max(bottom, endLine === Infinity ? lineCount - 1 : endLine);
	}

	if (!Number.isFinite(top) || bottom < top) return null;
	return {
		top: clamp(top, 0, lineCount - 1),
		bottom: clamp(bottom, 0, lineCount - 1)
	};
}

/**
 * Computes the `scrollTop` in px needed to keep the selected lines in view.
 *
 * @returns the target `scrollTop`, or `null` if the selection is already fully
 *   visible and no scroll is needed
 */
export function computeSelectionTarget(
	selection: CodeRange[],
	lineCount: number,
	lineHeightPx: number,
	clientHeight: number,
	scrollHeight: number,
	fadePx: number,
	fromScrollTop: number
): number | null {
	const lines = selectionLines(selection, lineCount);
	if (!lines || (lines.top === 0 && lines.bottom === lineCount - 1)) return null;

	const maxScroll = Math.max(0, scrollHeight - clientHeight);
	const topPx = lines.top * lineHeightPx;
	const bottomPx = (lines.bottom + 1) * lineHeightPx;
	const safeTop = fromScrollTop + fadePx;
	const safeBottom = fromScrollTop + clientHeight - fadePx;

	if (topPx >= safeTop && bottomPx <= safeBottom) return null;

	const target = topPx < safeTop ? topPx - fadePx : bottomPx - clientHeight + fadePx;
	return clamp(target, 0, maxScroll);
}

/**
 * Computes the resting `scrollTop` for a frame where nothing animates. The
 * position is anchored to the top of the content so seeking backwards through
 * a selection climbs back up instead of staying parked at an older position.
 *
 * @returns `0` before any selection happened, the target measured from the top
 *   while a past selection still owns the view, or `null` to keep the current
 *   scroll as it is
 */
export function computeIdleTarget(
	selection: CodeRange[],
	lineCount: number,
	lineHeightPx: number,
	clientHeight: number,
	scrollHeight: number,
	fadePx: number
): number | null {
	if (selection.length === 0) return 0;
	return computeSelectionTarget(
		selection,
		lineCount,
		lineHeightPx,
		clientHeight,
		scrollHeight,
		fadePx,
		0
	);
}

/**
 * Computes the `scrollTop` in px needed to reveal the line below `bottomLine`.
 *
 * @returns the target `scrollTop`, or `null` if the line is already in view
 *   and no scroll is needed
 */
export function computeRevealTarget(
	bottomLine: number,
	lineHeightPx: number,
	clientHeight: number,
	scrollHeight: number,
	fadePx: number,
	fromScrollTop: number
): number | null {
	const bottomPx = bottomLine * lineHeightPx;
	if (bottomPx <= fromScrollTop + clientHeight - fadePx) return null;

	const maxScroll = Math.max(0, scrollHeight - clientHeight);
	return clamp(bottomPx - clientHeight + fadePx, 0, maxScroll);
}

/**
 * Determines which edges need a fade mask given the current scroll position
 * (with a 1px tolerance at the extremes). Returns `'none'` when there is no
 * overflow or the viewport spans the whole content.
 */
export function scrollMask(
	scrollTop: number,
	clientHeight: number,
	scrollHeight: number
): ScrollMask {
	if (scrollHeight <= clientHeight + 1) return 'none';
	const maxScroll = Math.max(0, scrollHeight - clientHeight);
	const atTop = scrollTop <= 1;
	const atBottom = scrollTop >= maxScroll - 1;
	if (atTop && atBottom) return 'none';
	if (atTop) return 'bottom';
	if (atBottom) return 'top';
	return 'both';
}

function smoothstep(t: number): number {
	return t * t * (3 - 2 * t);
}

const FADE_STEPS = [0, 1 / 5, 2 / 5, 3 / 5, 4 / 5, 1];

function alphaStop(t: number): string {
	const a = smoothstep(t);
	if (a >= 1) return 'oklch(0 0 0 / 1)';
	if (a <= 0) return 'oklch(0 0 0 / 0)';
	return `oklch(0 0 0 / ${a.toFixed(3)})`;
}

function topStop(t: number, size: number): string {
	if (t === 0) return `${alphaStop(t)} 0`;
	if (t === 1) return `${alphaStop(t)} ${size}em`;
	return `${alphaStop(t)} calc(${size}em * ${t.toFixed(3)})`;
}

function bottomStop(t: number, size: number): string {
	if (t === 1) return `${alphaStop(1 - t)} 100%`;
	if (t === 0) return `${alphaStop(1 - t)} calc(100% - ${size}em)`;
	return `${alphaStop(1 - t)} calc(100% - ${size}em * ${(1 - t).toFixed(3)})`;
}

/**
 * Builds a smooth oklch fade mask for the scroll viewport. The fade is a
 * multi-stop gradient sampling a smoothstep curve over `size` ems instead of
 * a hard linear ramp, so the content eases out at the edges.
 */
export function fadeMaskImage(mask: ScrollMask, size: number): string {
	if (mask === 'none' || size <= 0) return '';
	if (mask === 'top') {
		return `linear-gradient(to bottom, ${FADE_STEPS.map((t) => topStop(t, size)).join(', ')})`;
	}
	if (mask === 'bottom') {
		return `linear-gradient(to bottom, ${FADE_STEPS.map((t) => bottomStop(t, size)).join(', ')})`;
	}
	return `linear-gradient(to bottom, ${[
		...FADE_STEPS.map((t) => topStop(t, size)),
		...FADE_STEPS.map((t) => bottomStop(t, size))
	].join(', ')})`;
}
