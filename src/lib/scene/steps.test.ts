import { describe, expect, it } from 'vitest';
import { createCodeState } from './code.svelte';
import { CodeStep } from './steps';

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
