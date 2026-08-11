import { beforeEach, describe, expect, it, vi } from 'vitest';

const race = vi.hoisted(() => ({
	ready: false,
	languageReady: true,
	readyCallbacks: [] as (() => void)[],
	refreshCallbacks: [] as (() => void)[]
}));

vi.mock('../code/highlighter', () => {
	const token = (code: string, line: number, col: number) => ({
		code,
		color: '#ff0000',
		line,
		col
	});
	return {
		isHighlighterReady: () => race.ready,
		onHighlighterReady: (callback: () => void) => {
			if (race.ready) {
				callback();
			} else {
				race.readyCallbacks.push(callback);
			}
		},
		onHighlighterRefresh: (callback: () => void) => {
			race.refreshCallbacks.push(callback);
		},
		highlight: (code: string) =>
			race.ready && race.languageReady
				? code
						.split('\n')
						.map((text, line) => token(text, line, 0))
						.filter((t) => t.code.length > 0)
				: [],
		diffStrings: (from: string, to: string) =>
			race.ready && race.languageReady
				? to
						.split('\n')
						.map((text, line) => ({
							code: text,
							color: '#00ff00',
							morph: 'create' as const,
							from: null,
							to: [0, line] as [number, number]
						}))
						.filter((t) => t.code.length > 0)
				: []
	};
});

import { CodeStep } from './steps';
import { createCodeState } from '../code/code.svelte';

describe('CodeStep highlighter race', () => {
	beforeEach(() => {
		race.ready = false;
		race.languageReady = true;
		race.readyCallbacks = [];
		race.refreshCallbacks = [];
	});

	function fireReady() {
		race.ready = true;
		for (const callback of race.readyCallbacks.splice(0)) callback();
	}

	function fireRefresh() {
		for (const callback of race.refreshCallbacks.splice(0)) callback();
	}

	function stepFor(from: string, to: string, language?: string) {
		const state = createCodeState(language ?? 'ts', from);
		const step = new CodeStep(state, () => ({ from, to, resolved: to }), 0.6, undefined, language);
		return { state, step };
	}

	it('defers the diff and recomputes once the highlighter becomes ready', () => {
		const { state, step } = stepFor('const a = 1;', 'const b = 2;');

		step.start();
		expect(state.tokens).toEqual([]);

		fireReady();

		expect(state.tokens?.length).toBeGreaterThan(0);
		expect(state.tokens?.every((t) => t.color.length > 0)).toBe(true);

		step.end();
		expect(state.resolved).toBe('const b = 2;');
		expect(state.settled.length).toBeGreaterThan(0);
		expect(state.settled.every((t) => t.color.length > 0)).toBe(true);
	});

	it('recomputes again once the language finishes loading', () => {
		race.ready = true;
		race.languageReady = false;
		const { state, step } = stepFor('let x = 1;', 'let y = 2;', 'svelte');

		step.start();
		expect(state.tokens).toEqual([]);
		expect(race.refreshCallbacks.length).toBeGreaterThan(0);

		race.languageReady = true;
		fireRefresh();

		expect(state.tokens?.length).toBeGreaterThan(0);

		step.end();
		expect(state.settled.length).toBeGreaterThan(0);
		expect(state.settled.every((t) => t.color.length > 0)).toBe(true);
	});

	it('does not mutate the committed state after the step ends', () => {
		const { state, step } = stepFor('const a = 1;', 'const b = 2;');

		step.start();
		fireReady();
		step.end();

		const settled = [...state.settled];
		const tokens = state.tokens;
		fireRefresh();

		expect(state.settled).toEqual(settled);
		expect(state.tokens).toEqual(tokens);
	});
});
