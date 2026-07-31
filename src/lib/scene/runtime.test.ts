import { describe, expect, it } from 'vitest';
import { SceneManager } from './runtime.svelte';
import { TickStep, type TickFrame } from './steps';

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
