import type { MorphToken, PositionedToken } from './highlight.js';

export interface RenderSpan {
	key: string;
	text: string;
	/** Left offset in monospace `ch` units. */
	leftCh: number;
	/** Top offset in `em` units. */
	topEm: number;
	alpha: number;
	color: string;
}

export interface ContentBounds {
	width: number;
	height: number;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, progress: number): number {
	return from + (to - from) * progress;
}

function easeInOutSine(progress: number): number {
	return -(Math.cos(Math.PI * clamp(progress, 0, 1)) - 1) / 2;
}

function clampRemap(
	value: number,
	inMin: number,
	inMax: number,
	outMin: number,
	outMax: number
): number {
	const progress = clamp((value - inMin) / (inMax - inMin), 0, 1);
	return outMin + (outMax - outMin) * progress;
}

function sideBounds(tokens: MorphToken[], side: 'from' | 'to'): ContentBounds {
	const bounds: ContentBounds = { width: 0, height: 0 };

	for (const token of tokens) {
		if (side === 'from' && token.morph === 'create') continue;
		if (side === 'to' && token.morph === 'delete') continue;

		const position = side === 'from' ? token.from : token.to;
		if (!position) continue;

		const width = position[0] + token.text.length;
		const height = position[1] + 1;
		if (width > bounds.width) bounds.width = width;
		if (height > bounds.height) bounds.height = height;
	}

	return bounds;
}

/**
 * Container bounds during a morph. The height tweens between the two states;
 * the width stays wide enough for both sides so new tokens never overflow.
 */
export function morphBounds(tokens: MorphToken[], progress: number): ContentBounds {
	const from = sideBounds(tokens, 'from');
	const to = sideBounds(tokens, 'to');
	return {
		width: Math.max(from.width, to.width),
		height: lerp(from.height, to.height, easeInOutSine(progress))
	};
}

/**
 * Fade alpha for a morph token. Deletes fade out over the first part of the
 * morph, creates fade in over the last part, and retained tokens stay visible.
 */
function alphaMorph(progress: number, morph: MorphToken['morph']): number {
	const overlap = 0.15;
	if (morph === 'delete') return clampRemap(progress, 0, 0.2 + overlap, 1, 0);
	if (morph === 'create') return clampRemap(progress, 0.8 - overlap, 1, 0, 1);
	return 1;
}

/** An empty highlight means every line is selected. */
function isSelected(line: number, selection: Set<number>): boolean {
	return selection.size === 0 || selection.has(line + 1);
}

function selectionAlpha(
	line: number,
	selection: Set<number>,
	previous: Set<number> | null,
	progress: number,
	unselectedOpacity: number
): number {
	const next = isSelected(line, selection) ? 1 : unselectedOpacity;
	if (previous === null || progress >= 1) return next;

	const before = isSelected(line, previous) ? 1 : unselectedOpacity;
	return lerp(before, next, easeInOutSine(progress));
}

/** Static spans for a settled code state. */
export function computeSettledSpans(
	tokens: PositionedToken[],
	selection: Set<number>,
	unselectedOpacity: number
): RenderSpan[] {
	return tokens.map((token, tokenIndex) => ({
		key: `${tokenIndex}`,
		text: token.text,
		leftCh: token.col,
		topEm: token.line,
		alpha: isSelected(token.line, selection) ? 1 : unselectedOpacity,
		color: token.color
	}));
}

/**
 * Animated spans for a token morph. Retained tokens glide from their source to
 * their target position, deletes stay at the source and fade out, and creates
 * sit at the target and fade in.
 */
export function computeMorphSpans(
	tokens: MorphToken[],
	progress: number,
	selection: Set<number>,
	previousSelection: Set<number>,
	unselectedOpacity: number
): RenderSpan[] {
	const spans: RenderSpan[] = [];
	const eased = easeInOutSine(progress);

	tokens.forEach((token, tokenIndex) => {
		let left: number;
		let top: number;

		if (token.morph === 'retain') {
			const fromCol = token.from?.[0] ?? 0;
			const fromLine = token.from?.[1] ?? 0;
			const toCol = token.to?.[0] ?? 0;
			const toLine = token.to?.[1] ?? 0;
			left = lerp(fromCol, toCol, eased);
			top = lerp(fromLine, toLine, eased);
		} else if (token.morph === 'delete') {
			left = token.from?.[0] ?? 0;
			top = token.from?.[1] ?? 0;
		} else {
			left = token.to?.[0] ?? 0;
			top = token.to?.[1] ?? 0;
		}

		let selectionLevel: number;
		if (token.morph === 'retain') {
			const fromLine = token.from?.[1] ?? 0;
			const toLine = token.to?.[1] ?? 0;
			const fromLevel = isSelected(fromLine, previousSelection) ? 1 : unselectedOpacity;
			const toLevel = isSelected(toLine, selection) ? 1 : unselectedOpacity;
			selectionLevel = lerp(fromLevel, toLevel, eased);
		} else {
			const line = token.morph === 'delete' ? (token.from?.[1] ?? 0) : (token.to?.[1] ?? 0);
			selectionLevel = selectionAlpha(
				line,
				selection,
				previousSelection,
				progress,
				unselectedOpacity
			);
		}

		const alpha = alphaMorph(progress, token.morph) * selectionLevel;

		if (alpha <= 0) return;

		spans.push({
			key: `${tokenIndex}`,
			text: token.text,
			leftCh: left,
			topEm: top,
			alpha,
			color: token.color
		});
	});

	return spans;
}
