import { createContext, flushSync } from 'svelte';
import { captureLayout, playLayout } from './layout.js';

export class SlideRuntime {
	step = $state(0);
	max = $state(0);
	root = $state<HTMLElement | null>(null);

	/** Called after a slide measures itself so the URL can pick up its last step. */
	onReady: (() => void) | null = null;

	setRoot(root: HTMLElement | null) {
		this.root = root;
		if (!root) {
			this.max = 0;
			return;
		}

		this.max = measureMax(root);
		if (this.step > this.max) this.step = this.max;
		syncVisibility(root, this.step, false);
		this.onReady?.();
	}

	release(root: HTMLElement) {
		/* a new slide may already have replaced this one, so only clear our own */
		if (this.root === root) {
			this.root = null;
			this.max = 0;
		}
	}

	setStep(step: number) {
		const root = this.root;
		const next = Math.max(0, Math.min(step, this.max));
		if (!root) {
			this.step = next;
			return;
		}
		if (next === this.step) return;

		const before = captureLayout(root);
		flushSync(() => {
			this.step = next;
			syncVisibility(root, next, true);
		});
		playLayout(root, before);
	}

	next() {
		if (this.step >= this.max) return false;
		this.setStep(this.step + 1);
		return true;
	}

	prev() {
		if (this.step <= 0) return false;
		this.setStep(this.step - 1);
		return true;
	}

	/** Restores a step without animating, for deep links and browser back. */
	jump(step: number) {
		this.step = Math.max(0, Math.min(step, this.max));
		if (this.root) syncVisibility(this.root, this.step, false);
	}

	/** Starts a fresh slide. `Infinity` means "land on the last step". */
	reset(step = 0) {
		this.step = step;
		this.max = 0;
		this.root = null;
	}
}

function measureMax(root: HTMLElement): number {
	let max = 0;

	for (const element of root.querySelectorAll<HTMLElement>('[data-step]')) {
		const step = Number(element.dataset.step);
		if (Number.isFinite(step) && step > max) max = step;
	}

	for (const element of root.querySelectorAll<HTMLElement>('[data-code-steps]')) {
		const count = Number(element.dataset.codeSteps);
		if (!Number.isFinite(count) || count < 1) continue;

		const parent = element.closest<HTMLElement>('[data-step]');
		const at = parent ? Number(parent.dataset.step) : 0;
		const start = Number.isFinite(at) ? at : 0;
		max = Math.max(max, start + count - 1);
	}

	return max;
}

function syncVisibility(root: HTMLElement, step: number, animate: boolean) {
	for (const element of root.querySelectorAll<HTMLElement>('[data-step], [data-until]')) {
		if (element.closest('[data-layout-ghost]')) continue;
		const from = Number(element.dataset.step);
		const until = Number(element.dataset.until);
		const hidden =
			(Number.isFinite(from) && from > step) || (Number.isFinite(until) && step >= until);
		const wasHidden = element.hasAttribute('data-slide-hidden');

		/*
		 * The attribute hides the element without overwriting its own display
		 * value, so a step can be a flex or grid container when it is visible.
		 */
		element.toggleAttribute('data-slide-hidden', hidden);

		/*
		 * A short rise and fade makes plain content feel intentional. Elements
		 * with layout targets are left to the layout engine so they do not move
		 * twice.
		 */
		if (
			!hidden &&
			wasHidden &&
			animate &&
			!element.hasAttribute('data-layout') &&
			!element.querySelector('[data-layout]')
		) {
			element.animate(
				[
					{ opacity: 0, transform: 'translateY(0.75rem)' },
					{ opacity: 1, transform: 'none' }
				],
				{ duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
			);
		}
	}
}

export const [getSlide, setSlide] = createContext<SlideRuntime>();
