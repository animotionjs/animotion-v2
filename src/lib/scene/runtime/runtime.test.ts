import { describe, expect, it } from 'vitest';
import { SceneManager } from './runtime.svelte';
import { TickStep, type Step, type TickFrame } from './steps';

class SpyStep implements Step {
	starts = 0;
	reverts = 0;
	ends = 0;
	duration = 1;
	start() {
		this.starts++;
	}
	setProgress(p: number) {
		void p;
	}
	end() {
		this.ends++;
	}
	revert() {
		this.reverts++;
	}
}

describe('SceneManager + TickStep (render mode)', () => {
	it('plays a tick step deterministically via advanceFrame', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();

		const frames: TickFrame[] = [];
		manager.load({ steps: [new TickStep((frame) => frames.push(frame), 1)] });

		manager.next();
		let guard = 0;
		while (!manager.finished && guard++ < 100) {
			manager.advanceFrame(0.1);
		}

		expect(guard).toBeLessThan(100);
		expect(frames.length).toBeGreaterThan(0);
		expect(frames.at(-1)!.time).toBe(1);
		expect(frames.at(-1)!.progress).toBe(1);
		expect(manager.step).toBe(0);
	});
});

describe('SceneManager resume after prev', () => {
	it('restarts the current step when resuming after prev', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();

		const step = new SpyStep();
		manager.load({ steps: [step] });

		expect(step.starts).toBe(1);
		expect(step.reverts).toBe(0);

		manager.next();
		manager.advanceFrame(0.5);
		expect(step.starts).toBe(1);

		manager.prev();
		expect(step.reverts).toBe(1);

		manager.next();
		expect(step.starts).toBe(2);
	});
});

describe('SceneManager finished step-change', () => {
	it('emits a step change when the final step finishes', () => {
		const manager = new SceneManager();
		manager.enableRenderMode();

		const changes: Array<{ step: number; total: number }> = [];
		manager.onStepChange((step, total) => changes.push({ step, total }));

		manager.load({ steps: [new SpyStep()] });

		manager.next();
		let guard = 0;
		while (!manager.finished && guard++ < 100) {
			manager.advanceFrame(0.1);
		}

		expect(manager.finished).toBe(true);
		expect(changes).toEqual([
			{ step: 0, total: 1 },
			{ step: 0, total: 1 }
		]);
	});
});

describe('SceneManager seek', () => {
	function loaded() {
		const manager = new SceneManager();
		manager.enableRenderMode();
		const steps = [new SpyStep(), new SpyStep(), new SpyStep()];
		manager.load({ steps });
		return { manager, steps };
	}

	it('positions the loaded scene at a step without animating or replaying the entrance', () => {
		const { manager } = loaded();

		manager.seek(1);

		expect(manager.step).toBe(1);
		expect(manager.finished).toBe(false);
		expect(manager.isAnimating).toBe(false);
		expect(manager.transitionState.opacity).toBe(1);
	});

	it('emits a step change and reaches the finished phase on the last step', () => {
		const { manager } = loaded();

		const changes: Array<{ step: number; total: number }> = [];
		manager.onStepChange((step, total) => changes.push({ step, total }));

		manager.seek(2, false, true);

		expect(manager.finished).toBe(true);
		expect(manager.step).toBe(2);
		expect(changes).toContainEqual({ step: 2, total: 3 });
	});

	it('marks the current step as completed without advancing the next step', () => {
		const { manager } = loaded();

		manager.seek(1, true, false);

		expect(manager.step).toBe(1);
		expect(manager.stepCompleted).toBe(true);
		expect(manager.finished).toBe(false);
		expect(manager.isAnimating).toBe(false);
	});

	it('leaves the manager at the start when seeking step 0', () => {
		const { manager } = loaded();

		manager.seek(0);

		expect(manager.step).toBe(0);
		expect(manager.finished).toBe(false);
	});

	it('reverts steps in reverse when seeking backwards', () => {
		const { manager, steps } = loaded();

		manager.seek(2, false, true);
		const revertsAfterFinish = steps.map((s) => s.reverts);

		manager.seek(0);

		expect(manager.step).toBe(0);
		expect(manager.finished).toBe(false);
		expect(steps.map((s) => s.reverts)).toEqual([
			revertsAfterFinish[0] + 1,
			revertsAfterFinish[1] + 1,
			revertsAfterFinish[2] + 1
		]);
	});
});
