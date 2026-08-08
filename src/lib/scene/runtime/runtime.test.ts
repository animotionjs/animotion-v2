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

describe('SceneManager determinism for time slicing', () => {
	it('reproduces identical tick frames across fresh drives', () => {
		const drive = () => {
			const manager = new SceneManager();
			manager.enableRenderMode();
			const frames: TickFrame[] = [];
			manager.load({ steps: [new TickStep((f) => frames.push(f), 1)] });
			manager.next();
			let guard = 0;
			while (!manager.finished && guard++ < 100) {
				manager.advanceFrame(1 / 60);
			}
			expect(guard).toBeLessThan(100);
			return frames.map((f) => `${f.progress}|${f.time}|${f.frame}`);
		};

		// Each slice runs in a fresh page, so the whole drive must be a pure
		// function of the step + advance calls (no accumulated state leaking
		// across drives, no real time / randomness).
		expect(drive()).toEqual(drive());
		expect(drive().length).toBeGreaterThan(0);
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
