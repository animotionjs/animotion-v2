import { isInSelection, type CodeRange } from './code.svelte';
import { clampRemap, easeInOutSine, lerp } from './easing';
import type { MorphToken, PositionedToken } from './highlighter';

export interface RenderSpan {
	key: string;
	text: string;
	leftCh: number;
	topEm: number;
	alpha: number;
	color: string;
	selected: number;
}

let spanId = 0;
function nextKey(): string {
	return `cs-${spanId++}`;
}

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

export function computeMorphSpans(
	tokens: MorphToken[],
	progress: number,
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
			const remapped = clampRemap(progress, 0.2, 0.8, 0, 1);
			const t = easeInOutSine(remapped);
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
