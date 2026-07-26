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

		let progress = 0;
		if (this.#stepCompleted) {
			progress = 1;
		} else if (this.#phase === 'tweening') {
			const step = this.#currentStep();
			if (step && step.duration > 0) {
				progress = Math.min(this.#elapsed / step.duration, 1);
			}
		}

		return (this.#stepIndex + progress) / this.#totalSteps;
	}

	attach({ steps, reset }: { steps: Step[]; reset: () => void }): void {
		this.detach();
		this.#steps = steps;
		this.#reset = reset;
		this.#totalSteps = steps.length;

		if (steps.length === 0) {
			this.#phase = 'finished';
			return;
		}

		this.#enterStep(0);
	}

	detach(): void {
		this.#stopLoop();
		this.#currentStep()?.exit();
		this.#steps = [];
		this.#reset = null;
		this.#phase = 'finished';
		this.#stepIndex = 0;
		this.#totalSteps = 0;
		this.#elapsed = 0;
		this.#stepCompleted = false;
	}

	next(): void {
		if (this.#phase === 'finished') return;

		if (this.#phase === 'tweening') {
			this.#stopLoop();
			this.#currentStep()?.setProgress(1);
			this.#currentStep()?.exit();
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

	prev(): void {
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
			step.enter();
			step.setProgress(1);
			step.exit();
			this.#stepIndex++;
		}

		const step = this.#steps[target];
		if (step) {
			step.enter();
			this.#phase = 'paused';
			this.#stepCompleted = false;
		}
	}

	#currentStep(): Step | undefined {
		return this.#steps[this.#stepIndex];
	}

	#playCurrent(): void {
		const step = this.#currentStep();
		if (step && step.duration > 0) {
			this.#phase = 'tweening';
			this.#startLoop();
		}
	}

	#enterStep(index: number): void {
		const step = this.#steps[index];
		if (!step) return;

		step.enter();
		this.#elapsed = 0;
		this.#stepCompleted = false;
		this.#phase = 'paused';
	}

	#advance(): void {
		this.#stepIndex++;
		this.#elapsed = 0;
		this.#stepCompleted = false;

		if (this.#stepIndex >= this.#steps.length) {
			this.#phase = 'finished';
			return;
		}

		this.#enterStep(this.#stepIndex);
	}

	#startLoop(): void {
		const step = this.#currentStep();
		if (!step) return;

		this.#phase = 'tweening';
		this.#lastFrame = performance.now();

		const onFrame = (now: number) => {
			const delta = (now - this.#lastFrame) / 1000;
			this.#lastFrame = now;

			this.#elapsed += delta;
			const progress = this.#elapsed / step.duration;
			step.setProgress(progress);

			if (progress >= 1) {
				step.exit();
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

			this.#rafId = requestAnimationFrame(onFrame);
		};

		this.#rafId = requestAnimationFrame(onFrame);
	}

	#stopLoop(): void {
		if (this.#rafId !== null) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
		}
	}
}
