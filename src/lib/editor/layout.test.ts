import { describe, expect, it } from 'vitest';
import { laneAt, layoutLanes, sceneRegions, totalDuration } from './layout.js';
import type { Sequence } from '../scene/runtime/sequence.js';
import type { SceneTimeline } from '../scene/runtime/runtime.svelte.js';

/** The rate these tests measure at, so the cache key is real. */
const FPS = 60;

function timeline(...durations: number[]): SceneTimeline {
	return {
		enterDuration: 0,
		introHold: 0,
		steps: durations.map((duration) => ({ duration, wait: 0 })),
		totalDuration: durations.reduce((sum, duration) => sum + duration, 0)
	};
}

/** A measurement map keyed the way the cache keys it, by scene and rate. */
function measuredAt(entries: Array<[string, SceneTimeline]>, fps = FPS) {
	return new Map(entries.map(([id, value]) => [`${id}@${fps}`, value]));
}

function sequence(...ids: string[]): Sequence {
	return ids.map((id, index) => ({
		id,
		order: index + 1,
		component: () => Promise.resolve({ default: () => null as never })
	}));
}

describe('layoutLanes', () => {
	it('places measured scenes end to end', () => {
		const measured = measuredAt([
			['a', timeline(2)],
			['b', timeline(1, 3)]
		]);
		const lanes = layoutLanes(sequence('a', 'b'), measured, FPS);

		expect(lanes.map((lane) => [lane.start, lane.duration])).toEqual([
			[0, 2],
			[2, 4]
		]);
	});

	it('gives an unmeasured scene no room and no shift to its neighbours', () => {
		const measured = measuredAt([['c', timeline(5)]]);
		const lanes = layoutLanes(sequence('a', 'b', 'c'), measured, FPS);

		expect(lanes.map((lane) => lane.duration)).toEqual([0, 0, 5]);
		expect(lanes[2]!.start).toBe(0);
	});

	it('totals every measured scene', () => {
		const measured = measuredAt([
			['a', timeline(2)],
			['b', timeline(1, 3)]
		]);
		expect(totalDuration(layoutLanes(sequence('a', 'b'), measured, FPS))).toBe(6);
	});

	it('reads a scene measured at the requested rate', () => {
		const measured = measuredAt([['a', timeline(2)]], 30);
		expect(layoutLanes(sequence('a'), measured, 30)[0]!.duration).toBe(2);
	});

	it('treats a scene measured at another rate as unmeasured', () => {
		// the length is a frame count over the rate, so another rate cannot reuse it
		const measured = measuredAt([['a', timeline(2)]], 30);
		expect(layoutLanes(sequence('a'), measured, 60)[0]!.duration).toBe(0);
	});
});

describe('sceneRegions', () => {
	it('lays out enter, hold, step and wait in presentation seconds', () => {
		const measured = measuredAt([
			['x', timeline(2)],
			[
				'a',
				{
					enterDuration: 0.4,
					introHold: 0.2,
					steps: [{ duration: 0.5, wait: 0.3 }],
					totalDuration: 1.4
				}
			]
		]);
		const lanes = layoutLanes(sequence('x', 'a'), measured, FPS);
		const regions = sceneRegions(lanes[1]!);

		expect(regions).toEqual([
			{ kind: 'enter', start: 2, end: 2.4 },
			{ kind: 'hold', start: 2.4, end: 2.6 },
			{ kind: 'step', start: 2.6, end: 3.1 },
			{ kind: 'wait', start: 3.1, end: 3.4 }
		]);
	});

	it('gives an unmeasured scene no regions', () => {
		const lanes = layoutLanes(sequence('a'), new Map(), FPS);
		expect(sceneRegions(lanes[0]!)).toEqual([]);
	});
});

describe('laneAt', () => {
	const measured = measuredAt([
		['a', timeline(2)],
		['c', timeline(4)]
	]);

	it('resolves a time inside a lane to a local offset', () => {
		const lanes = layoutLanes(sequence('a', 'c'), measured, FPS);
		expect(laneAt(lanes, 3)).toEqual({ index: 1, local: 1 });
	});

	it('lands on a lane boundary at the later scene start', () => {
		const lanes = layoutLanes(sequence('a', 'c'), measured, FPS);
		expect(laneAt(lanes, 2)).toEqual({ index: 1, local: 0 });
	});

	it('clamps a time past the end to the last measured lane', () => {
		const lanes = layoutLanes(sequence('a', 'c'), measured, FPS);
		expect(laneAt(lanes, 99)).toEqual({ index: 1, local: 4 });
	});

	it('skips an unmeasured lane and keeps the local offset right', () => {
		const lanes = layoutLanes(sequence('a', 'b', 'c'), measured, FPS);
		expect(laneAt(lanes, 3)).toEqual({ index: 2, local: 1 });
	});

	it('holds at the start when nothing is measured', () => {
		const lanes = layoutLanes(sequence('a', 'b'), new Map(), FPS);
		expect(laneAt(lanes, 5)).toEqual({ index: 1, local: 0 });
	});
});
