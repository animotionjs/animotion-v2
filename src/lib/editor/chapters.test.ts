import { describe, expect, it } from 'vitest';
import {
	buildChapters,
	chaptersWarning,
	formatTimestamp,
	titleFromId,
	type ChapterScene
} from './chapters.js';

function scene(overrides: Partial<ChapterScene> = {}): ChapterScene {
	return { id: 'intro', title: '', start: 0, duration: 12, ...overrides };
}

describe('formatTimestamp', () => {
	it('writes minutes and seconds below an hour', () => {
		expect(formatTimestamp(0)).toBe('0:00');
		expect(formatTimestamp(12)).toBe('0:12');
		expect(formatTimestamp(65)).toBe('1:05');
		expect(formatTimestamp(605)).toBe('10:05');
	});

	it('adds hours once the video passes one', () => {
		expect(formatTimestamp(3600)).toBe('1:00:00');
		expect(formatTimestamp(3725)).toBe('1:02:05');
	});

	it('floors a fraction of a second and never goes negative', () => {
		expect(formatTimestamp(9.9)).toBe('0:09');
		expect(formatTimestamp(-5)).toBe('0:00');
	});
});

describe('titleFromId', () => {
	it('reads a slug as words', () => {
		expect(titleFromId('intro')).toBe('Intro');
		expect(titleFromId('first-idea')).toBe('First idea');
		expect(titleFromId('why_layout_matters')).toBe('Why layout matters');
	});

	it('leaves a single word alone', () => {
		expect(titleFromId('demo')).toBe('Demo');
	});
});

describe('buildChapters', () => {
	it('anchors the first chapter at zero and keeps the rest', () => {
		const text = buildChapters([
			scene({ id: 'intro', title: 'Welcome', start: 0, duration: 12 }),
			scene({ id: 'layout', title: 'Layout', start: 12, duration: 20 }),
			scene({ id: 'end', title: 'Thanks', start: 32, duration: 15 })
		]);
		expect(text).toBe(['0:00 Welcome', '0:12 Layout', '0:32 Thanks'].join('\n'));
	});

	it('falls back to a readable id when a scene has no title', () => {
		const text = buildChapters([
			scene({ id: 'first-idea', start: 0 }),
			scene({ id: 'second-idea', start: 12 }),
			scene({ id: 'third-idea', start: 24 })
		]);
		expect(text).toContain('0:00 First idea');
		expect(text).toContain('0:12 Second idea');
	});

	it('keeps a short scene whose start is far enough from the chapter before it', () => {
		const text = buildChapters([
			scene({ id: 'intro', title: 'Welcome', start: 0, duration: 12 }),
			// a two second beat still starts a full chapter, because it comes late enough
			scene({ id: 'beat', title: 'Pause', start: 12, duration: 2 }),
			scene({ id: 'layout', title: 'Layout', start: 22, duration: 20 })
		]);
		expect(text.split('\n')).toEqual(['0:00 Welcome', '0:12 Pause', '0:22 Layout']);
	});

	it('folds a scene whose start is too close to the chapter before it', () => {
		const text = buildChapters([
			scene({ id: 'intro', title: 'Welcome', start: 0, duration: 4 }),
			// starts under ten seconds after the intro, so it cannot stand alone
			scene({ id: 'beat', title: 'Pause', start: 4, duration: 2 }),
			scene({ id: 'layout', title: 'Layout', start: 14, duration: 20 })
		]);
		const lines = text.split('\n');
		expect(lines).toEqual(['0:00 Welcome', '0:14 Layout']);
		expect(text).not.toContain('Pause');
	});

	it('returns nothing for no scenes', () => {
		expect(buildChapters([])).toBe('');
	});
});

describe('chaptersWarning', () => {
	it('accepts a list with three chapters', () => {
		expect(
			chaptersWarning([
				scene({ start: 0 }),
				scene({ id: 'b', start: 12 }),
				scene({ id: 'c', start: 24 })
			])
		).toBeNull();
	});

	it('warns when there are too few chapters', () => {
		expect(chaptersWarning([scene({ start: 0 }), scene({ id: 'b', start: 12 })])).toMatch(
			/at least 3/
		);
	});

	it('counts after folding, so short scenes do not pad the list', () => {
		expect(
			chaptersWarning([
				scene({ start: 0 }),
				scene({ id: 'b', start: 12, duration: 2 }),
				scene({ id: 'c', start: 14, duration: 2 })
			])
		).toMatch(/at least 3/);
	});
});
