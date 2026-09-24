import { describe, expect, it, vi } from 'vitest';
import { onMount } from 'svelte';
import { createSoundCue, type SoundCue } from '../audio/index.js';
import { createScene, type SceneBuilder } from './builder.svelte.js';
import { SceneManager } from './runtime.svelte.js';
import { getSceneManager } from './context.svelte.js';
import type { Step } from './steps.js';

vi.mock('./context.svelte.js', () => ({
	getSceneManager: vi.fn(),
	getSceneId: vi.fn()
}));

// `createScene` needs `onMount`, which throws outside a component, so tests drive the manager directly
vi.mock('svelte', async (importOriginal) => {
	const actual = await importOriginal<typeof import('svelte')>();
	return { ...actual, onMount: vi.fn() };
});

/** A step that does nothing except take up a second of the timeline. */
class TimedStep implements Step {
	duration = 1;
	start() {}
	setProgress() {}
	end() {}
	revert() {}
}

function setupManager() {
	const manager = new SceneManager();
	vi.mocked(getSceneManager).mockReturnValue(manager as never);
	return manager;
}

describe('createScene step/progress', () => {
	it('exposes the current step and step progress, driven by the manager', () => {
		const manager = setupManager();
		const scene = createScene({});

		expect(scene.step).toBe(0);
		expect(scene.progress).toBe(0);

		manager.enableRenderMode();
		manager.load({ steps: [new TimedStep(), new TimedStep()] });

		manager.next();
		expect(scene.step).toBe(0);
		expect(scene.progress).toBeGreaterThanOrEqual(0);

		manager.advanceFrame(1);
		expect(scene.progress).toBe(1);

		manager.next();
		expect(scene.step).toBe(1);
		expect(scene.progress).toBe(0);
	});

	it('is read-only', () => {
		setupManager();
		const scene = createScene({});

		const writable = scene as { step: number; progress: number };
		expect(() => {
			writable.step = 5;
		}).toThrow();
		expect(() => {
			writable.progress = 0.5;
		}).toThrow();

		expect(scene.step).toBe(0);
		expect(scene.progress).toBe(0);
	});

	it('rejects reserved step/progress initial keys', () => {
		setupManager();
		expect(() => createScene({ step: 1 })).toThrow(/reserved/);
		expect(() => createScene({ progress: 1 })).toThrow(/reserved/);
	});

	it('leaves the caller initial object untouched and reusable', () => {
		setupManager();
		const initial = { x: 1, indent: '\t' };

		createScene(initial);
		createScene(initial);

		expect(initial).toEqual({ x: 1, indent: '\t' });
		expect('step' in initial).toBe(false);
		expect('progress' in initial).toBe(false);
	});

	it('accepts a frozen initial object', () => {
		setupManager();
		const scene = createScene(Object.freeze({ x: 1 }));

		expect(scene.x).toBe(1);
		expect(scene.step).toBe(0);
	});
});

describe('createScene sound', () => {
	it('normalizes cues separately from visual steps and uses sequential default seeds', () => {
		const { steps, sounds } = stepsAfter((scene) => {
			scene
				.sound('chime', { at: 0.1, volume: 0.3 })
				.tick(() => {}, 1)
				.sound('chime', { at: 0.4 })
				.sound('chime', { seed: 20 });
		});

		expect(steps).toHaveLength(1);
		expect(sounds).toEqual([
			createSoundCue('chime', { at: 0.1, volume: 0.3 }, 1),
			createSoundCue('chime', { at: 0.4 }, 2),
			createSoundCue('chime', { at: 1, seed: 20 }, 3)
		]);
	});

	it('uses the visual cursor for omitted timing after steps, all groups, and waits', () => {
		const { sounds } = stepsAfter((scene) => {
			scene
				.tick(() => {}, 1)
				.sound('click')
				.all((s) => {
					s.tween('x', 1, 2);
					s.sound('click');
				})
				.sound('click')
				.layout(() => {}, 0.5)
				.sound('click')
				.wait(0.25)
				.sound('click');
		});

		expect(sounds.map((cue) => cue.at)).toEqual([1, 1, 3, 3.5, 3.75]);
	});

	it('resolves delay relative to the current cursor without moving that cursor', () => {
		const { sounds } = stepsAfter((scene) => {
			scene
				.tick(() => {}, 2)
				.sound('click', { delay: 0.25 })
				.sound('click', { delay: 0 });
		});

		expect(sounds.map((cue) => cue.at)).toEqual([2.25, 2]);
	});

	it('keeps repeat and waits in the visual cursor', () => {
		const { steps, sounds, holdBeforeFirstStep } = stepsAfter((scene) => {
			scene
				.wait(1)
				.sound('click')
				.repeat(2, (s, index) => {
					s.tick(() => {}, index + 1);
					s.sound('click');
					s.wait(0.5);
				})
				.sound('click');
		});

		expect(holdBeforeFirstStep).toBe(1);
		expect(steps).toEqual([
			{ duration: 1, wait: 0.5 },
			{ duration: 2, wait: 0.5 }
		]);
		expect(sounds.map((cue) => cue.at)).toEqual([1, 2, 4.5, 5]);
	});

	it('keeps an explicit at value absolute after visual work', () => {
		const { sounds } = stepsAfter((scene) => {
			scene.tick(() => {}, 2).sound('click', { at: 0.25 });
		});

		expect(sounds[0]?.at).toBe(0.25);
	});

	it('anchors sounds in an all group to its start', () => {
		const { steps, sounds } = stepsAfter((scene) => {
			scene
				.tick(() => {}, 2)
				.all((s) => {
					s.tween('x', 1, 4);
					s.sound('click');
					s.sound('click', { delay: 0.5 });
					s.sound('click', { at: 0.25 });
				})
				.sound('click');
		});

		expect(steps).toEqual([
			{ duration: 2, wait: 0 },
			{ duration: 4, wait: 0 }
		]);
		expect(sounds.map((cue) => cue.at)).toEqual([2, 2.5, 0.25, 6]);
	});

	it('keeps nested all groups on the outer group start', () => {
		const { steps, sounds } = stepsAfter((scene) => {
			scene
				.all((s) => {
					s.all((inner) => {
						inner.tween('x', 1, 2);
						inner.sound('click');
					});
					s.sound('click', { delay: 0.5 });
				})
				.sound('click');
		});

		expect(steps).toEqual([{ duration: 2, wait: 0 }]);
		expect(sounds.map((cue) => cue.at)).toEqual([0, 0.5, 2]);
	});

	it('does not add a visual step for a sound only all group', () => {
		const { steps, sounds } = stepsAfter((scene) => {
			scene
				.tick(() => {}, 1)
				.all((s) => {
					s.sound('click');
					s.sound('chime', { delay: 0.25 });
				})
				.sound('click');
		});

		expect(steps).toEqual([{ duration: 1, wait: 0 }]);
		expect(sounds.map((cue) => cue.at)).toEqual([1, 1.25, 1]);
	});

	it('rejects conflicting or invalid relative timing', () => {
		setupManager();
		const scene = createScene({});

		expect(() => scene.sound('click', { at: 0, delay: 0 })).toThrow(RangeError);
		expect(() => scene.sound('click', { delay: -1 })).toThrow(/finite.*nonnegative/);
		expect(() => scene.sound('click', { delay: Number.NaN })).toThrow(RangeError);
		expect(() => scene.sound('click', { delay: Number.POSITIVE_INFINITY })).toThrow(RangeError);
	});
});

/** Mounts a scene and captures what `createScene` hands to `manager.load`. */
function stepsAfter(configure: (scene: SceneBuilder<Record<string, unknown>>) => void) {
	const manager = setupManager();
	let steps: { duration: number; wait: number }[] = [];
	let sounds: readonly SoundCue[] = [];
	let holdBeforeFirstStep = 0;
	const mount = vi.fn<(fn: () => void) => void>();
	vi.mocked(onMount).mockImplementation((fn: () => void) => mount(fn));
	vi.spyOn(manager, 'load').mockImplementation(
		({ steps: loaded, sounds: loadedSounds, holdBeforeFirstStep: first }) => {
			steps = loaded.map((step) => ({ duration: step.duration, wait: step.wait ?? 0 }));
			sounds = loadedSounds ?? [];
			holdBeforeFirstStep = first ?? 0;
		}
	);

	const scene = createScene({});
	configure(scene);
	mount.mock.calls[0]?.[0]?.();

	return { steps, sounds, holdBeforeFirstStep, manager };
}

describe('createScene camera', () => {
	it('merges the initial overrides over the defaults', () => {
		setupManager();
		const scene = createScene({ camera: { zoom: 1.4 } });

		expect(scene.camera.zoom).toBe(1.4);
		expect(scene.camera.x).toBe(0);
		expect(scene.camera.y).toBe(0);
		expect(scene.camera.deg).toBe(0);
	});

	it('rejects a non-object camera initial value', () => {
		setupManager();
		expect(() => createScene({ camera: 2 })).toThrow(/camera/);
	});

	it('leaves the caller initial object untouched', () => {
		setupManager();
		const initial = { camera: { zoom: 1.4 } };

		createScene(initial);

		expect(initial).toEqual({ camera: { zoom: 1.4 } });
	});

	it('frame appends a flight step with its duration', () => {
		const { steps } = stepsAfter((scene) => {
			scene.frame({ x: 100 }, { zoom: 2, duration: 2 });
		});

		expect(steps.map((s) => s.duration)).toEqual([2]);
	});
});

describe('createScene repeat', () => {
	it('appends the callback steps once per repetition', () => {
		const { steps } = stepsAfter((scene) => {
			scene.repeat(3, (s) => s.tick(() => {}, 1));
		});

		expect(steps.map((s) => s.duration)).toEqual([1, 1, 1]);
	});

	it('passes the repetition index to the callback', () => {
		const { steps } = stepsAfter((scene) => {
			scene.repeat(2, (s, i) => s.tick(() => {}, i + 1));
		});

		expect(steps.map((s) => s.duration)).toEqual([1, 2]);
	});

	it('rejects a negative or non-integer count', () => {
		setupManager();
		const scene = createScene({});

		expect(() => scene.repeat(-1, () => {})).toThrow(/count/);
		expect(() => scene.repeat(1.5, () => {})).toThrow(/count/);
	});
});

describe('createScene wait', () => {
	it('a wait adds its seconds to the step before it', () => {
		const { steps } = stepsAfter((scene) => {
			scene.tick(() => {}, 1).wait(2);
		});

		expect(steps).toEqual([{ duration: 1, wait: 2 }]);
	});

	it('stacks consecutive waits on the same step', () => {
		const { steps } = stepsAfter((scene) => {
			scene
				.tick(() => {}, 1)
				.wait(1)
				.wait(2);
		});

		expect(steps).toEqual([{ duration: 1, wait: 3 }]);
	});

	it("a wait before any step holds the scene's first frame", () => {
		const { steps, holdBeforeFirstStep } = stepsAfter((scene) => {
			scene.wait(2).tick(() => {}, 1);
		});

		expect(holdBeforeFirstStep).toBe(2);
		expect(steps).toEqual([{ duration: 1, wait: 0 }]);
	});
});

describe('createScene reveal', () => {
	function loadTwoSteps(manager: SceneManager) {
		manager.enableRenderMode();
		manager.load({ steps: [new TimedStep(), new TimedStep()] });
	}

	it('fades item i in as step i plays and keeps earlier items visible', () => {
		const manager = setupManager();
		const scene = createScene({});
		const opacity = scene.reveal();
		loadTwoSteps(manager);

		expect(opacity(0)).toBe(0);
		expect(opacity(1)).toBe(0);

		manager.next();
		manager.advanceFrame(0.5);
		expect(opacity(0)).toBeCloseTo(0.5);
		expect(opacity(1)).toBe(0);

		manager.advanceFrame(0.5);
		expect(opacity(0)).toBe(1);
		expect(opacity(1)).toBe(0);

		manager.next();
		manager.advanceFrame(1);
		expect(opacity(0)).toBe(1);
		expect(opacity(1)).toBe(1);
	});

	it('with lead 1 pre-reveals item 0 before any step plays', () => {
		const manager = setupManager();
		const scene = createScene({});
		const opacity = scene.reveal(1);
		loadTwoSteps(manager);

		expect(opacity(0)).toBe(1);
		expect(opacity(1)).toBe(0);
	});
});

describe('createScene crossfade', () => {
	it('fades the current item out, swaps at the midpoint, fades the next in', () => {
		const manager = setupManager();
		const scene = createScene({});
		const fade = scene.crossfade(['a', 'b']);
		manager.enableRenderMode();
		manager.load({ steps: [new TimedStep()] });

		expect(fade.index).toBe(0);
		expect(fade.item).toBe('a');
		expect(fade.opacity).toBe(1);

		manager.next();
		manager.advanceFrame(0.25);
		expect(fade.item).toBe('a');
		expect(fade.opacity).toBeCloseTo(0.5);

		manager.advanceFrame(0.25);
		expect(fade.index).toBe(1);
		expect(fade.item).toBe('b');
		expect(fade.opacity).toBeCloseTo(0);

		manager.advanceFrame(0.5);
		expect(fade.item).toBe('b');
		expect(fade.opacity).toBe(1);
	});
});
