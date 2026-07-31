import { describe, expect, it } from 'vitest';
import { createCodeState } from './code.svelte';
import { CodeStep, TickStep, type TickFrame } from './steps';
import { easeInOut } from './easing';

describe('TickStep', () => {
	it('reports eased progress and linear time', () => {
		const frames: TickFrame[] = [];
		const step = new TickStep((frame) => frames.push(frame), 2, easeInOut);

		expect(step.duration).toBe(2);

		step.start();
		step.setProgress(0.5);
		step.setProgress(1);

		expect(frames[0].time).toBe(1);
		expect(frames[0].progress).toBe(easeInOut(0.5));
		expect(frames[0].deltaTime).toBe(1);
		expect(frames[0].frame).toBe(1);

		expect(frames[1].time).toBe(2);
		expect(frames[1].progress).toBe(1);
		expect(frames[1].deltaTime).toBe(1);
		expect(frames[1].frame).toBe(2);
	});

	it('defaults to raw (identity) progress', () => {
		const frames: TickFrame[] = [];
		const step = new TickStep((frame) => frames.push(frame), 1);

		step.start();
		step.setProgress(0.4);

		expect(frames[0].progress).toBe(0.4);
		expect(frames[0].time).toBe(0.4);
	});

	it('revert rewinds to the start frame', () => {
		const frames: TickFrame[] = [];
		const step = new TickStep((frame) => frames.push(frame), 1);

		step.start();
		step.setProgress(0.75);
		step.revert();

		expect(frames.at(-1)).toEqual({ progress: 0, time: 0, deltaTime: 0, frame: 0 });
	});
});

describe('CodeStep language change', () => {
	it('fades between languages: all delete + create, no retain', () => {
		const state = createCodeState('ts', 'const x = 1;');
		const step = new CodeStep(
			state,
			() => ({ from: state.resolved, to: 'const x = 2;', resolved: 'const x = 2;' }),
			0.6,
			undefined,
			'js'
		);
		step.start();
		expect(state.language).toBe('js');
		expect(state.tokens).not.toBeNull();
		expect(state.tokens?.some((t) => t.morph === 'retain')).toBe(false);
		expect(state.tokens?.some((t) => t.morph === 'delete')).toBe(true);
		expect(state.tokens?.some((t) => t.morph === 'create')).toBe(true);
		step.end();
		expect(state.resolved).toBe('const x = 2;');
		expect(state.settled.length).toBeGreaterThan(0);
	});

	it('same language keeps the normal retain morph', () => {
		const state = createCodeState('ts', 'const x = 1;');
		const step = new CodeStep(
			state,
			() => ({ from: state.resolved, to: 'const x = 2;', resolved: 'const x = 2;' }),
			0.6,
			undefined,
			'ts'
		);
		step.start();
		expect(state.language).toBe('ts');
		expect(state.tokens?.some((t) => t.morph === 'retain')).toBe(true);
	});

	it('revert restores the previous language and settled tokens', () => {
		const state = createCodeState('ts', 'const x = 1;');
		const beforeSettled = state.settled;
		const step = new CodeStep(
			state,
			() => ({ from: state.resolved, to: 'const x = 2;', resolved: 'const x = 2;' }),
			0.6,
			undefined,
			'js'
		);
		step.start();
		step.end();
		expect(state.language).toBe('js');
		step.revert();
		expect(state.language).toBe('ts');
		expect(state.settled).toEqual(beforeSettled);
	});
});
