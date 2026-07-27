import type { Step } from './steps';

export class SceneManager {
	#phase: 'paused' | 'tweening' | 'finished' = $state('finished');
	#stepIndex = $state(0);
	#totalSteps = $state(0);
	#steps: Step[] = [];
	#reset: (() => void) | null = null;
	#elapsed = 0;
	#stepCompleted = false;
	#rafId: number | null = null;
	#lastFrame = 0;

	get finished(): boolean {
		return this.#phase === 'finished';
	}

	get step(): number {
		return this.#stepIndex;
	}

	get totalSteps(): number {
		return this.#totalSteps;
	}

	get completion(): number {
		if (this.#phase === 'finished') return 1;
		if (this.#totalSteps === 0) return 0;
		const done = this.#phase !== 'paused' || this.#stepCompleted;
		return (this.#stepIndex + (done ? 1 : 0)) / this.totalSteps;
	}

	load({ steps, reset }: { steps: Step[]; reset: () => void }) {
		this.clear();
		this.#steps = steps;
		this.#reset = reset;
		this.#totalSteps = steps.length;

		if (steps.length === 0) {
			this.#phase = 'finished';
			return;
		}

		this.#enterStep(0);
	}

	clear() {
		this.#stopLoop();
		this.#currentStep()?.end();
		this.#steps = [];
		this.#reset = null;
		this.#phase = 'finished';
		this.#stepIndex = 0;
		this.#totalSteps = 0;
		this.#elapsed = 0;
		this.#stepCompleted = false;
	}

	next() {
		if (this.#phase === 'finished') return;

		if (this.#phase === 'tweening') {
			this.#stopLoop();
			this.#currentStep()?.setProgress(1);
			this.#currentStep()?.end();
			this.#stepCompleted = false;
			this.#advance();
			this.#playCurrent();
			return;
		}

		if (this.#stepCompleted) {
			this.#stepCompleted = false;
			this.#advance();
			this.#playCurrent();
		} else {
			this.#phase = 'tweening';
			this.#startLoop();
		}
	}

	prev() {
		if (this.#stepIndex === 0) return;

		const target = this.#stepIndex - 1;
		this.#stopLoop();
		this.#reset?.();

		this.#stepIndex = 0;
		this.#elapsed = 0;
		this.#stepCompleted = false;

		while (this.#stepIndex < target) {
			const step = this.#steps[this.#stepIndex];
			if (!step) break;
			step.start();
			step.setProgress(1);
			step.end();
			this.#stepIndex++;
		}

		const step = this.#steps[target];
		if (step) {
			step.start();
			this.#phase = 'paused';
			this.#stepCompleted = false;
		}
	}

	#currentStep(): Step | undefined {
		return this.#steps[this.#stepIndex];
	}

	#playCurrent() {
		const step = this.#currentStep();
		if (step && step.duration > 0) {
			this.#phase = 'tweening';
			this.#startLoop();
		}
	}

	#enterStep(index: number) {
		const step = this.#steps[index];
		if (!step) return;

		step.start();
		this.#elapsed = 0;
		this.#stepCompleted = false;
		this.#phase = 'paused';
	}

	#advance() {
		this.#stepIndex++;
		this.#elapsed = 0;
		this.#stepCompleted = false;

		if (this.#stepIndex >= this.#steps.length) {
			this.#phase = 'finished';
			return;
		}

		this.#enterStep(this.#stepIndex);
	}

	#startLoop() {
		const step = this.#currentStep();
		if (!step) return;

		this.#phase = 'tweening';
		this.#lastFrame = performance.now();

		const frame = (now: number) => {
			const delta = (now - this.#lastFrame) / 1000;
			this.#lastFrame = now;

			this.#elapsed += delta;
			const progress = this.#elapsed / step.duration;
			step.setProgress(progress);

			if (progress >= 1) {
				step.end();
				this.#stepCompleted = true;
				this.#rafId = null;
				if (this.#stepIndex >= this.#steps.length - 1) {
					this.#phase = 'finished';
				} else {
					this.#phase = 'paused';
				}
				return;
			}

			if (this.#phase !== 'tweening') return;

			this.#rafId = requestAnimationFrame(frame);
		};

		this.#rafId = requestAnimationFrame(frame);
	}

	#stopLoop() {
		if (this.#rafId !== null) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
		}
	}
}
