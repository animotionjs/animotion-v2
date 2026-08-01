import { flushSync } from 'svelte';
import { type CodeRange, type CodeState } from './code.svelte';
import { clamp, easeInOut, lerp } from './easing';
import { diffStrings, highlight, type MorphToken, type PositionedToken } from './lezer';

export interface Step {
	readonly duration: number;
	setProgress(p: number): void;
	start(): void;
	end(): void;
	revert(): void;
}

export class TweenStep implements Step {
	#state: Record<string, unknown>;
	#key: string;
	#to: number;
	#duration: number;
	#ease: (p: number) => number;
	#from = 0;

	constructor(
		state: Record<string, unknown>,
		key: string,
		to: number,
		duration: number,
		ease: (p: number) => number = easeInOut
	) {
		this.#state = state;
		this.#key = key;
		this.#to = to;
		this.#duration = duration;
		this.#ease = ease;
	}

	get duration(): number {
		return this.#duration;
	}

	setProgress(p: number) {
		this.#state[this.#key] = lerp(this.#from, this.#to, this.#ease(clamp(p, 0, 1)));
	}

	start() {
		this.#from = this.#state[this.#key] as number;
	}

	end() {
		this.#state[this.#key] = this.#to;
	}

	revert() {
		this.#state[this.#key] = this.#from;
	}
}

export interface TickFrame {
	/** eased progress 0..1 within this step */
	progress: number;
	/** linear seconds elapsed within this step (0..duration) */
	time: number;
	/** seconds since this step's previous frame */
	deltaTime: number;
	/** number of frames rendered for this step */
	frame: number;
}

export class TickStep implements Step {
	#onTick: (frame: TickFrame) => void;
	#duration: number;
	#ease: (p: number) => number;
	#time = 0;
	#frame = 0;

	constructor(
		onTick: (frame: TickFrame) => void,
		duration: number,
		ease: (p: number) => number = (p) => p
	) {
		this.#onTick = onTick;
		this.#duration = duration;
		this.#ease = ease;
	}

	get duration(): number {
		return this.#duration;
	}

	start() {
		this.#time = 0;
		this.#frame = 0;
	}

	setProgress(p: number) {
		const time = clamp(p, 0, 1) * this.#duration;
		this.#frame++;
		this.#onTick({
			progress: this.#ease(clamp(p, 0, 1)),
			time,
			deltaTime: time - this.#time,
			frame: this.#frame
		});
		this.#time = time;
	}

	end() {}

	revert() {
		this.#onTick({ progress: 0, time: 0, deltaTime: 0, frame: 0 });
		this.#time = 0;
		this.#frame = 0;
	}
}

export class LayoutStep implements Step {
	#state: Record<string, unknown>;
	#change: () => void;
	#duration: number;
	#ease: (p: number) => number;
	#snapshot: Record<string, unknown> = {};
	#tweens: Array<{
		el: HTMLElement;
		deltaX: number;
		deltaY: number;
		scaleX: number;
		scaleY: number;
	}> = [];

	constructor(
		state: Record<string, unknown>,
		change: () => void,
		duration: number,
		ease: (p: number) => number = easeInOut
	) {
		this.#state = state;
		this.#change = change;
		this.#duration = duration;
		this.#ease = ease;
	}

	get duration(): number {
		return this.#duration;
	}

	setProgress(p: number) {
		const progress = clamp(p, 0, 1);
		const eased = this.#ease(progress);
		for (const { el, deltaX, deltaY, scaleX, scaleY } of this.#tweens) {
			el.style.transform = `translate(${deltaX * (1 - eased)}px, ${deltaY * (1 - eased)}px) scale(${lerp(scaleX, 1, eased)}, ${lerp(scaleY, 1, eased)})`;
		}
	}

	start() {
		this.#snapshot = {};
		for (const key of Object.keys(this.#state)) {
			const val = this.#state[key];
			if (Array.isArray(val)) {
				this.#snapshot[key] = [...val];
			} else {
				this.#snapshot[key] = val;
			}
		}

		const elements = [...document.querySelectorAll('[data-layout]')] as HTMLElement[];
		const firstBounds: Record<string, DOMRect> = {};
		for (const el of elements) {
			const rect = el.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				firstBounds[el.dataset.layout!] = rect;
			}
		}

		this.#change();
		flushSync();

		const lastElements = [...document.querySelectorAll('[data-layout]')] as HTMLElement[];
		this.#tweens = [];
		for (const el of lastElements) {
			const curr = el.getBoundingClientRect();
			const prev = firstBounds[el.dataset.layout!];
			if (!prev) continue;

			const deltaX = prev.left - curr.left;
			const deltaY = prev.top - curr.top;
			const scaleX = prev.width / curr.width;
			const scaleY = prev.height / curr.height;

			el.style.transformOrigin = 'top left';
			el.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`;

			this.#tweens.push({ el, deltaX, deltaY, scaleX, scaleY });
		}
	}

	end() {
		for (const { el } of this.#tweens) el.style.transform = '';
		this.#tweens = [];
	}

	revert() {
		for (const key of Object.keys(this.#snapshot)) {
			this.#state[key] = this.#snapshot[key];
		}
		for (const { el } of this.#tweens) el.style.transform = '';
		this.#tweens = [];
		this.#snapshot = {};
	}
}

export class ParallelStep implements Step {
	#steps: Step[];
	#done: boolean[] = [];

	constructor(steps: Step[]) {
		this.#steps = steps;
	}

	get duration(): number {
		return Math.max(...this.#steps.map((s) => s.duration));
	}

	setProgress(p: number) {
		const progress = clamp(p, 0, 1);
		for (let i = 0; i < this.#steps.length; i++) {
			if (this.#done[i]) continue;
			this.#steps[i].setProgress(progress);
			if (progress >= 1) {
				this.#done[i] = true;
				this.#steps[i].end();
			}
		}
	}

	start() {
		this.#done = this.#steps.map(() => false);
		for (const step of this.#steps) step.start();
	}

	end() {
		for (let i = 0; i < this.#steps.length; i++) {
			if (!this.#done[i]) this.#steps[i].end();
		}
		this.#done = [];
	}

	revert() {
		for (const step of this.#steps) step.revert();
	}
}

export class CodeStep implements Step {
	#codeState: CodeState;
	#build: () => { from: string; to: string; resolved: string };
	#duration: number;
	#ease: (p: number) => number;
	#language: string | null = null;
	#snapshot: {
		resolved: string;
		settled: PositionedToken[];
		tokens: MorphToken[] | null;
		progress: number;
		language: string;
	} | null = null;
	#pendingResolved = '';
	#pendingSettled: PositionedToken[] = [];

	constructor(
		codeState: CodeState,
		build: () => { from: string; to: string; resolved: string },
		duration: number,
		ease: (p: number) => number = easeInOut,
		language?: string
	) {
		this.#codeState = codeState;
		this.#build = build;
		this.#duration = duration;
		this.#ease = ease;
		this.#language = language ?? null;
	}

	get duration(): number {
		return this.#duration;
	}

	start() {
		const langChanged = this.#language !== null && this.#language !== this.#codeState.language;
		this.#snapshot = {
			resolved: this.#codeState.resolved,
			settled: this.#codeState.settled,
			tokens: this.#codeState.tokens,
			progress: this.#codeState.progress,
			language: this.#codeState.language
		};
		this.#pendingResolved = this.#codeState.resolved;
		this.#pendingSettled = this.#codeState.settled;
		const { from, to, resolved } = this.#build();
		if (langChanged) {
			this.#codeState.language = this.#language!;
			const deletes: MorphToken[] = this.#codeState.settled.map((t) => ({
				code: t.code,
				classes: t.classes,
				morph: 'delete',
				from: [t.col, t.line],
				to: null
			}));
			const creates: MorphToken[] = highlight(to, this.#codeState.language).map((t) => ({
				code: t.code,
				classes: t.classes,
				morph: 'create',
				from: null,
				to: [t.col, t.line]
			}));
			this.#codeState.tokens = [...deletes, ...creates];
			this.#pendingSettled = highlight(to, this.#codeState.language);
		} else {
			this.#codeState.tokens = diffStrings(from, to, this.#codeState.language);
			this.#pendingSettled = highlight(to, this.#codeState.language);
		}
		this.#codeState.progress = 0;
		this.#pendingResolved = resolved;
	}

	setProgress(p: number) {
		this.#codeState.progress = this.#ease(clamp(p, 0, 1));
	}

	end() {
		this.#codeState.resolved = this.#pendingResolved;
		this.#codeState.settled = this.#pendingSettled;
		this.#codeState.tokens = null;
		this.#codeState.progress = 1;
	}

	revert() {
		if (!this.#snapshot) return;
		this.#codeState.resolved = this.#snapshot.resolved;
		this.#codeState.settled = this.#snapshot.settled;
		this.#codeState.tokens = this.#snapshot.tokens;
		this.#codeState.progress = this.#snapshot.progress;
		this.#codeState.language = this.#snapshot.language;
		this.#snapshot = null;
	}
}

export class SelectionStep implements Step {
	#codeState: CodeState;
	#range: CodeRange[];
	#duration: number;
	#snapshot: { selection: CodeRange[]; selectionProgress: number | null } | null = null;

	constructor(codeState: CodeState, range: CodeRange[], duration: number) {
		this.#codeState = codeState;
		this.#range = range;
		this.#duration = duration;
	}

	get duration(): number {
		return this.#duration;
	}

	start() {
		this.#snapshot = {
			selection: this.#codeState.selection,
			selectionProgress: this.#codeState.selectionProgress
		};
		this.#codeState.previousSelection = this.#snapshot.selection;
		this.#codeState.selection = this.#range;
		this.#codeState.selectionProgress = 0;
	}

	setProgress(p: number) {
		this.#codeState.selectionProgress = clamp(p, 0, 1);
	}

	end() {
		this.#codeState.selectionProgress = null;
		this.#codeState.previousSelection = null;
	}

	revert() {
		if (!this.#snapshot) return;
		this.#codeState.selection = this.#snapshot.selection;
		this.#codeState.selectionProgress = this.#snapshot.selectionProgress;
		this.#codeState.previousSelection = null;
		this.#snapshot = null;
	}
}
