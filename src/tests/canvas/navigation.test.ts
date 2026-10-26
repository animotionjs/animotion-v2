import { describe, expect, it } from 'vitest';
import { nextStep, previousStep, stepSpans } from '../../lib/canvas/navigation.js';
import type { TimelineStep } from '../../lib/canvas/scene.js';

const steps: TimelineStep[] = [
	{ index: 0, label: 'parallel', duration: 0.5 },
	{ index: 1, label: 'wait', duration: 0.3 },
	{ index: 2, label: 'code', duration: 0.4 },
	{ index: 3, label: 'wait', duration: 0.2 },
	{ index: 4, label: 'code', duration: 0.6 }
];

describe('canvas navigation', () => {
	it('skips waits when moving forward', () => {
		const spans = stepSpans(steps);
		expect(nextStep(spans, 0)?.start).toBe(0);
		expect(nextStep(spans, 0.5)?.start).toBe(0.8);
		expect(nextStep(spans, 0.8)?.start).toBe(0.8);
		expect(nextStep(spans, 1.2)?.start).toBeCloseTo(1.4);
		expect(nextStep(spans, 2)).toBeNull();
	});

	it('skips waits when moving backward and restarts a step in progress', () => {
		const spans = stepSpans(steps);
		expect(previousStep(spans, 2)?.start).toBeCloseTo(1.4);
		expect(previousStep(spans, 1.6)?.start).toBeCloseTo(1.4);
		expect(previousStep(spans, 1.4)?.start).toBeCloseTo(0.8);
		expect(previousStep(spans, 0.9)?.start).toBe(0.8);
		expect(previousStep(spans, 0.8)?.start).toBe(0);
		expect(previousStep(spans, 0)).toBeNull();
	});
});
