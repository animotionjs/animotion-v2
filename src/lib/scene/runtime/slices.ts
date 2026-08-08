/** A contiguous, 1-based frame range of a scene's serial frame sequence. */
export type SliceRange = { start: number; end: number };

/**
 * Splits frames `1..total` into `n` contiguous, non-empty ranges, distributing
 * the leftover frames (when `total` is not evenly divisible) to the earliest
 * ranges. `n` is clamped to `[1, total]` so every range holds at least one
 * frame. Slice boundaries are arbitrary (they may fall mid-step or mid-tween);
 * the render driver pre-rolls each range from frame 1 so no frame is skipped
 * or duplicated.
 */
export function sliceRanges(total: number, n: number): SliceRange[] {
	const count = Math.min(Math.max(1, Math.trunc(n)), total);
	const base = Math.floor(total / count);
	const extra = total % count;
	const ranges: SliceRange[] = [];
	let start = 1;
	for (let k = 0; k < count; k++) {
		const len = base + (k < extra ? 1 : 0);
		ranges.push({ start, end: start + len - 1 });
		start += len;
	}
	return ranges;
}
