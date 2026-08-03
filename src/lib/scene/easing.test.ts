import { describe, expect, it } from 'vitest';
import {
	linear,
	easeInQuad,
	easeOutQuad,
	easeInOutQuad,
	easeInCubic,
	easeOutCubic,
	easeInOutCubic,
	easeInQuart,
	easeOutQuart,
	easeInOutQuart,
	easeInQuint,
	easeOutQuint,
	easeInOutQuint,
	easeInSine,
	easeOutSine,
	easeInOutSine,
	easeInExpo,
	easeOutExpo,
	easeInOutExpo,
	easeInCirc,
	easeOutCirc,
	easeInOutCirc,
	easeInBack,
	easeOutBack,
	easeInOutBack,
	easeInElastic,
	easeOutElastic,
	easeInOutElastic,
	easeInBounce,
	easeOutBounce,
	easeInOutBounce,
	easeInOut,
	easeOut,
	type Easing
} from './easing';

const monotonic: Easing[] = [
	linear,
	easeInQuad,
	easeOutQuad,
	easeInOutQuad,
	easeInCubic,
	easeOutCubic,
	easeInOutCubic,
	easeInQuart,
	easeOutQuart,
	easeInOutQuart,
	easeInQuint,
	easeOutQuint,
	easeInOutQuint,
	easeInSine,
	easeOutSine,
	easeInOutSine,
	easeInExpo,
	easeOutExpo,
	easeInOutExpo,
	easeInCirc,
	easeOutCirc,
	easeInOutCirc
];

const bouncing: Easing[] = [easeInBounce, easeOutBounce, easeInOutBounce];

const overshooting: Easing[] = [
	easeInBack,
	easeOutBack,
	easeInOutBack,
	easeInElastic,
	easeOutElastic,
	easeInOutElastic
];

describe.each(monotonic.map((ease) => [ease.name, ease]))('%s', (_name, ease) => {
	it('starts at 0 and ends at 1', () => {
		expect(ease(0)).toBeCloseTo(0);
		expect(ease(1)).toBeCloseTo(1);
	});

	it('stays within [0, 1]', () => {
		for (let i = 0; i <= 100; i++) {
			const v = ease(i / 100);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(1);
		}
	});

	it('is non-decreasing', () => {
		let prev = -Infinity;
		for (let i = 0; i <= 100; i++) {
			const v = ease(i / 100);
			expect(v).toBeGreaterThanOrEqual(prev);
			prev = v;
		}
	});
});

describe.each(bouncing.map((ease) => [ease.name, ease]))('%s', (_name, ease) => {
	it('starts at 0 and ends at 1', () => {
		expect(ease(0)).toBeCloseTo(0);
		expect(ease(1)).toBeCloseTo(1);
	});

	it('stays within [0, 1]', () => {
		for (let i = 0; i <= 100; i++) {
			const v = ease(i / 100);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(1);
		}
	});
});

describe.each(overshooting.map((ease) => [ease.name, ease]))('%s', (_name, ease) => {
	it('starts at 0 and ends at 1', () => {
		expect(ease(0)).toBeCloseTo(0);
		expect(ease(1)).toBeCloseTo(1);
	});

	it('overshoots past the [0, 1] range', () => {
		let min = Infinity;
		let max = -Infinity;
		for (let i = 0; i <= 100; i++) {
			const v = ease(i / 100);
			min = Math.min(min, v);
			max = Math.max(max, v);
		}
		expect(max > 1 || min < 0).toBe(true);
	});
});

describe('legacy aliases', () => {
	it('expose the original quadratic easings', () => {
		expect(easeInOut).toBe(easeInOutQuad);
		expect(easeOut).toBe(easeOutQuad);
	});

	it('match their named equivalents', () => {
		for (let i = 0; i <= 100; i++) {
			const p = i / 100;
			expect(easeInOut(p)).toBe(easeInOutQuad(p));
			expect(easeOut(p)).toBe(easeOutQuad(p));
		}
	});
});
