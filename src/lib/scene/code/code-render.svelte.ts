import { isInSelection, type CodeRange } from './code.svelte';
import { clampRemap, easeInOutSine, lerp } from '../easing';
import type { MorphToken, PositionedToken } from './highlighter';

/**
 * A positioned text span rendered by `<Code>`. `leftCh` is in `ch` units,
 * `topEm` in `em`; `alpha` and `selected` are opacity multipliers combined as
 * `alpha * selected`.
 */
export interface RenderSpan {
	key: string;
	text: string;
	leftCh: number;
	topEm: number;
	alpha: number;
	color: string;
	selected: number;
}

export interface ContentBounds {
	width: number;
	height: number;
}

/**
 * Bounds of the content visible on one side of a morph: the "from" side covers
 * retain + delete tokens at their `from` positions, the "to" side covers
 * retain + create tokens at their `to` positions.
 */
function sideBounds(tokens: MorphToken[], side: 'from' | 'to'): ContentBounds {
	let width = 0;
	let height = 0;
	for (const token of tokens) {
		if (side === 'from' && token.morph === 'create') continue;
		if (side === 'to' && token.morph === 'delete') continue;
		const pos = side === 'from' ? token.from : token.to;
		if (!pos) continue;
		const parts = token.code.split('\n');
		for (let i = 0; i < parts.length; i++) {
			const w = pos[0] + parts[i].length;
			const h = pos[1] + i + 1;
			if (w > width) width = w;
			if (h > height) height = h;
		}
	}
	return { width, height };
}

/**
 * Container bounds during a morph, tweened between the "from" and "to"
 * content using the normalized morph window, so the container resizes in
 * lockstep with token movement instead of jumping.
 */
export function morphBounds(tokens: MorphToken[], progress: number): ContentBounds {
	const from = sideBounds(tokens, 'from');
	const to = sideBounds(tokens, 'to');
	const t = easeInOutSine(progress);
	return { width: lerp(from.width, to.width, t), height: lerp(from.height, to.height, t) };
}

/**
 * Number of digits needed in the line-number gutter across both sides of a
 * morph, so the gutter width stays stable while lines change.
 */
export function morphDigitCount(tokens: MorphToken[]): number {
	const from = Math.ceil(sideBounds(tokens, 'from').height);
	const to = Math.ceil(sideBounds(tokens, 'to').height);
	return Math.max(1, String(Math.max(from, to)).length);
}

let spanId = 0;
function nextKey(): string {
	return `cs-${spanId++}`;
}

/**
 * Fade alpha for a morph token during a morph. Deletes fade out over the
 * first 20% of progress; creates fade in over the last 20%; retained tokens
 * stay at full opacity. The 0.15 overlap keeps both sides briefly visible.
 */
function alphaMorph(progress: number, morph: 'create' | 'delete' | 'retain'): number {
	const overlap = 0.15;
	if (morph === 'delete') {
		return clampRemap(progress, 0, 0.2 + overlap, 1, 0);
	}
	if (morph === 'create') {
		return clampRemap(progress, 0.8 - overlap, 1, 0, 1);
	}
	return 1;
}

/**
 * Opacity for a span at a 0-indexed `line`/`col`, lerping between the
 * previous and current selection while a selection transition plays.
 *
 * @returns `1` when inside the selection, `unselectedOpacity` otherwise;
 *   during a transition, the eased interpolation between the previous and
 *   current values
 */
export function selectionOpacity(
	line: number,
	col: number,
	length: number,
	selection: CodeRange[],
	previousSelection: CodeRange[] | null,
	progress: number | null,
	unselectedOpacity: number
): number {
	const newOpacity = isInSelection(line, col, length, selection) ? 1 : unselectedOpacity;
	if (progress === null || previousSelection === null) return newOpacity;
	const oldOpacity = isInSelection(line, col, length, previousSelection) ? 1 : unselectedOpacity;
	return lerp(oldOpacity, newOpacity, easeInOutSine(progress));
}

/** Builds static spans from settled tokens (no morph active), at full alpha. */
export function computeSettledSpans(
	settled: PositionedToken[],
	selection: CodeRange[],
	selectionProgress: number | null,
	previousSelection: CodeRange[] | null,
	unselectedOpacity: number
): RenderSpan[] {
	const spans: RenderSpan[] = [];

	for (const token of settled) {
		const selected = selectionOpacity(
			token.line,
			token.col,
			token.code.length,
			selection,
			previousSelection,
			selectionProgress,
			unselectedOpacity
		);
		spans.push({
			key: nextKey(),
			text: token.code,
			leftCh: token.col,
			topEm: token.line,
			alpha: 1,
			color: token.color,
			selected
		});
	}

	return spans;
}

/**
 * Builds animated spans for a morph. `progress` (raw, uneased) drives fade
 * alpha via {@link alphaMorph}; `morphProgress` drives position: retained
 * tokens lerp from their `from` to `to` position, deletes stay at their `from`
 * position, creates at their `to` position.
 */
export function computeMorphSpans(
	tokens: MorphToken[],
	progress: number,
	morphProgress: number,
	selection: CodeRange[],
	selectionProgress: number | null,
	previousSelection: CodeRange[] | null,
	unselectedOpacity: number
): RenderSpan[] {
	const spans: RenderSpan[] = [];

	for (const token of tokens) {
		const alpha = alphaMorph(progress, token.morph);
		if (alpha <= 0) continue;

		let baseX: number;
		let baseY: number;
		let targetX: number | null = null;
		let targetY: number | null = null;

		if (token.morph === 'retain') {
			const fromCol = token.from?.[0] ?? 0;
			const fromLine = token.from?.[1] ?? 0;
			const toCol = token.to?.[0] ?? 0;
			const toLine = token.to?.[1] ?? 0;
			const t = easeInOutSine(morphProgress);
			baseX = lerp(fromCol, toCol, t);
			baseY = lerp(fromLine, toLine, t);
			targetX = toCol;
			targetY = toLine;
		} else if (token.morph === 'delete') {
			baseX = token.from?.[0] ?? 0;
			baseY = token.from?.[1] ?? 0;
		} else {
			baseX = token.to?.[0] ?? 0;
			baseY = token.to?.[1] ?? 0;
		}

		const parts = token.code.split('\n');
		for (let i = 0; i < parts.length; i++) {
			const text = parts[i];
			if (text.length === 0) continue;
			const y = baseY + i;
			const selLine = targetY ?? baseY;
			const selCol = targetX ?? baseX;
			const selected = selectionOpacity(
				selLine + i,
				i === 0 ? selCol : 0,
				text.length,
				selection,
				previousSelection,
				selectionProgress,
				unselectedOpacity
			);
			spans.push({
				key: nextKey(),
				text,
				leftCh: baseX,
				topEm: y,
				alpha,
				color: token.color,
				selected
			});
		}
	}

	return spans;
}
