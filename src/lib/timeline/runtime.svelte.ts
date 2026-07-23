import { untrack } from 'svelte';
import { getSceneManager } from './context.svelte';
import { signalManager } from './signal.svelte';

export const PAUSE = Symbol('pause');

export function pause() {
	return PAUSE;
}

export class SceneManager {
	#phase: 'paused' | 'tweening' | 'finished' = $state('finished');
	#step = $state(0);
	#totalSteps = $state(0);
	#rafId: number | null = null;
	#gen: Generator | null = null;
	#factory: (() => Generator) | null = null;
	#signals = new Set<{ reset(): void }>();

	register(signal: { reset(): void }): void {
		this.#signals.add(signal);
	}

	get finished(): boolean {
		return this.#phase === 'finished';
	}

	get step(): number {
		return this.#step;
	}

	get totalSteps(): number {
		return this.#totalSteps;
	}

	get completion(): number {
		if (this.#phase === 'finished') return 1;
		return Math.min(this.#step / (this.#totalSteps + 1), 1);
	}

	attach(factory: () => Generator) {
		this.detach();
		this.#factory = factory;
		this.#signals.clear();
		signalManager.currentManager = this;

		const gen = factory();
		const result = gen.next(0);
		this.#gen = gen;

		if (result.done) {
			this.#phase = 'finished';
			return;
		}
		this.#phase = 'paused';
		this.#step = 0;
		this.#totalSteps = 0;
	}

	detach() {
		signalManager.currentManager = null;
		this.#stopLoop();
		this.#gen = null;
		this.#phase = 'finished';
		this.#step = 0;
		this.#totalSteps = 0;
		for (const sig of this.#signals) sig.reset();
		this.#signals.clear();
	}

	next() {
		if (this.#phase === 'finished') return;
		const gen = this.#gen;
		if (!gen) return;

		if (this.#phase === 'tweening') {
			this.#stopLoop();
			const result = gen.next(Infinity);
			this.#advance(result);
		} else {
			const result = gen.next(0);
			this.#advance(result);
		}
	}

	async prev() {
		if (this.#step === 0) return;
		const target = this.#step - 1;
		const factory = this.#factory;
		if (!factory) return;

		this.#stopLoop();
		this.#gen = null;
		this.#phase = 'paused';
		this.#step = 0;
		this.#totalSteps = 0;

		for (const sig of this.#signals) sig.reset();

		signalManager.currentManager = this;
		const gen = factory();
		this.#gen = gen;
		let r = gen.next(0);

		while (this.#step < target && !r.done) {
			while (r.value !== PAUSE && !r.done) {
				r = gen.next(Infinity);
			}
			if (r.done) break;

			this.#step++;
			if (this.#step > this.#totalSteps) this.#totalSteps = this.#step;
			if (this.#step >= target) break;

			await raf();
			r = gen.next(0);
		}

		if (r.done) this.#phase = 'finished';
	}

	#advance(initial: IteratorResult<unknown, void>) {
		let result = initial;

		while (!result.done) {
			if (result.value !== PAUSE) {
				this.#startLoop();
				return;
			}
			this.#crossPause();
			result = this.#gen!.next(0);
		}

		this.#phase = 'finished';
	}

	#crossPause() {
		this.#step++;
		if (this.#step > this.#totalSteps) {
			this.#totalSteps = this.#step;
		}
	}

	#startLoop() {
		const gen = this.#gen!;
		this.#phase = 'tweening';

		let lastTimestamp = performance.now();

		const onFrame = (now: number) => {
			const delta = (now - lastTimestamp) / 1000;
			lastTimestamp = now;
			const result = gen.next(delta);

			if (result.done) {
				this.#phase = 'finished';
				return;
			}
			if (result.value === PAUSE) {
				this.#crossPause();
				this.#phase = 'paused';
				return;
			}
			this.#rafId = requestAnimationFrame(onFrame);
		};

		lastTimestamp = performance.now();
		this.#rafId = requestAnimationFrame(onFrame);
	}

	#stopLoop() {
		if (this.#rafId !== null) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
		}
	}
}

function raf(): Promise<void> {
	return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function scene(sceneFactory: () => Generator) {
	const manager = getSceneManager();

	$effect(() => {
		untrack(() => manager.attach(sceneFactory));
		return () => manager.detach();
	});
}
