import { describe, expect, it } from 'vitest';
import { sliceRanges } from './slices';

describe('sliceRanges', () => {
	it('splits frames into n contiguous non-overlapping ranges', () => {
		expect(sliceRanges(508, 4)).toEqual([
			{ start: 1, end: 127 },
			{ start: 128, end: 254 },
			{ start: 255, end: 381 },
			{ start: 382, end: 508 }
		]);
	});

	it('distributes leftover frames to the earliest ranges', () => {
		expect(sliceRanges(5, 3)).toEqual([
			{ start: 1, end: 2 },
			{ start: 3, end: 4 },
			{ start: 5, end: 5 }
		]);
	});

	it('covers every frame exactly once', () => {
		for (const total of [1, 2, 7, 60, 1000]) {
			for (const n of [1, 2, 4, 8]) {
				const ranges = sliceRanges(total, n);
				const union = new Set<number>();
				let prevEnd = 0;
				for (const r of ranges) {
					expect(r.start).toBe(prevEnd + 1);
					for (let f = r.start; f <= r.end; f++) union.add(f);
					prevEnd = r.end;
				}
				expect(ranges.length).toBe(Math.min(n, total));
				expect(prevEnd).toBe(total);
				expect(union.size).toBe(total);
			}
		}
	});

	it('returns a single range when n is 1 or exceeds the total', () => {
		expect(sliceRanges(100, 1)).toEqual([{ start: 1, end: 100 }]);
		expect(sliceRanges(2, 4)).toEqual([
			{ start: 1, end: 1 },
			{ start: 2, end: 2 }
		]);
	});
});
