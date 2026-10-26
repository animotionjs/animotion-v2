import type { TimelineStep } from './scene.js';

const EPSILON = 1e-4;

export interface StepSpan {
	start: number;
	end: number;
	label: string;
}

/** Converts a scene timeline into absolute start and end times. */
export function stepSpans(steps: readonly TimelineStep[]): StepSpan[] {
	let cursor = 0;
	return steps.map((step) => {
		const span = {
			start: cursor,
			end: cursor + step.duration,
			label: step.label
		};
		cursor = span.end;
		return span;
	});
}

function isManualStep(span: StepSpan): boolean {
	return span.label !== 'wait' && span.end - span.start > EPSILON;
}

/**
 * The next step a right arrow press should reveal. Holds are skipped, so a
 * press always lands on a visible change or on the scene boundary.
 */
export function nextStep(spans: readonly StepSpan[], time: number): StepSpan | null {
	return spans.find((span) => span.end > time + EPSILON && isManualStep(span)) ?? null;
}

/**
 * The previous step a left arrow press should return to. Holds are skipped,
 * and a step already in progress restarts from its own beginning.
 */
export function previousStep(spans: readonly StepSpan[], time: number): StepSpan | null {
	for (let index = spans.length - 1; index >= 0; index--) {
		const span = spans[index]!;
		if (isManualStep(span) && span.start < time - EPSILON) return span;
	}
	return null;
}
