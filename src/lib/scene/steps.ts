import { flushSync } from 'svelte';
import { type CodeRange, type CodeState } from './code.svelte';
import { clamp, easeInOut, lerp, type Easing } from './easing';
import { diffStrings, highlight, type MorphToken, type PositionedToken } from './highlighter';

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
	#ease: Easing;
	#from = 0;

	constructor(
		state: Record<string, unknown>,
		key: string,
		to: number,
		duration: number,
		ease: Easing = easeInOut
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
	#ease: Easing;
	#time = 0;
	#frame = 0;

	constructor(onTick: (frame: TickFrame) => void, duration: number, ease: Easing = (p) => p) {
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

export type LayoutTransition = 'fade' | 'scale' | 'clip' | 'wipe' | 'none';

export interface LayoutOptions {
	enter?: LayoutTransition;
	exit?: LayoutTransition;
}

const DEFAULT_ENTER: LayoutTransition = 'fade';
const DEFAULT_EXIT: LayoutTransition = 'fade';

type LayoutMode = 'flip' | 'enter' | 'exit';

interface LayoutTween {
	el: HTMLElement;
	mode: LayoutMode;
	transition: LayoutTransition;
	deltaX: number;
	deltaY: number;
	scaleX: number;
	scaleY: number;
}

function transitionValue(
	transition: LayoutTransition,
	p: number,
	direction: 'enter' | 'exit'
): { opacity?: number; transform?: string; clipPath?: string } {
	switch (transition) {
		case 'fade':
			return { opacity: direction === 'enter' ? p : 1 - p };
		case 'scale':
			return { transform: `scale(${direction === 'enter' ? p : 1 - p})` };
		case 'clip': {
			const r = direction === 'enter' ? 100 * p : 100 * (1 - p);
			return { clipPath: `circle(${r}% at 50% 50%)` };
		}
		case 'wipe': {
			const side = direction === 'enter' ? 100 * (1 - p) : 100 * p;
			return { clipPath: `inset(0 ${side}% 0 0)` };
		}
		case 'none':
			return {};
	}
}

export class LayoutStep implements Step {
	#state: Record<string, unknown>;
	#change: () => void;
	#duration: number;
	#ease: Easing;
	#enter: LayoutTransition;
	#exit: LayoutTransition;
	#snapshot: Record<string, unknown> = {};
	#tweens: LayoutTween[] = [];

	constructor(
		state: Record<string, unknown>,
		change: () => void,
		duration: number,
		ease: Easing = easeInOut,
		options: LayoutOptions = {}
	) {
		this.#state = state;
		this.#change = change;
		this.#duration = duration;
		this.#ease = ease;
		this.#enter = options.enter ?? DEFAULT_ENTER;
		this.#exit = options.exit ?? DEFAULT_EXIT;
	}

	get duration(): number {
		return this.#duration;
	}

	setProgress(p: number) {
		const progress = clamp(p, 0, 1);
		const eased = this.#ease(progress);
		for (const tween of this.#tweens) {
			if (tween.mode === 'flip') {
				tween.el.style.transform = `translate(${tween.deltaX * (1 - eased)}px, ${tween.deltaY * (1 - eased)}px) scale(${lerp(tween.scaleX, 1, eased)}, ${lerp(tween.scaleY, 1, eased)})`;
			} else {
				const value = transitionValue(
					tween.transition,
					eased,
					tween.mode === 'enter' ? 'enter' : 'exit'
				);
				if (value.opacity !== undefined) tween.el.style.opacity = String(value.opacity);
				if (value.transform !== undefined) tween.el.style.transform = value.transform;
				if (value.clipPath !== undefined) tween.el.style.clipPath = value.clipPath;
			}
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
		const firstBounds = new Map<string, { el: HTMLElement; rect: DOMRect }>();
		for (const el of elements) {
			const rect = el.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				firstBounds.set(el.dataset.layout!, { el, rect });
			}
		}

		this.#change();
		flushSync();

		const lastElements = [...document.querySelectorAll('[data-layout]')] as HTMLElement[];
		const lastBounds = new Map<string, { el: HTMLElement; rect: DOMRect }>();
		for (const el of lastElements) {
			const rect = el.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				lastBounds.set(el.dataset.layout!, { el, rect });
			}
		}

		this.#tweens = [];

		for (const [key, { el, rect }] of lastBounds) {
			const prev = firstBounds.get(key);
			if (prev) {
				const deltaX = prev.rect.left - rect.left;
				const deltaY = prev.rect.top - rect.top;
				const scaleX = prev.rect.width / rect.width;
				const scaleY = prev.rect.height / rect.height;
				el.style.transformOrigin = 'top left';
				el.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`;
				this.#tweens.push({
					el,
					mode: 'flip',
					transition: 'none',
					deltaX,
					deltaY,
					scaleX,
					scaleY
				});
			} else {
				this.#applyStart(el, this.#enter, 'enter');
				this.#tweens.push({
					el,
					mode: 'enter',
					transition: this.#enter,
					deltaX: 0,
					deltaY: 0,
					scaleX: 1,
					scaleY: 1
				});
			}
		}

		for (const [key, { el, rect }] of firstBounds) {
			if (lastBounds.has(key)) continue;
			if (this.#exit === 'none') continue;
			const ghost = this.#createGhost(el, rect);
			this.#applyStart(ghost, this.#exit, 'exit');
			this.#tweens.push({
				el: ghost,
				mode: 'exit',
				transition: this.#exit,
				deltaX: 0,
				deltaY: 0,
				scaleX: 1,
				scaleY: 1
			});
		}
	}

	#applyStart(el: HTMLElement, transition: LayoutTransition, direction: 'enter' | 'exit') {
		if (transition === 'scale') el.style.transformOrigin = 'center';
		const value = transitionValue(transition, 0, direction);
		if (value.opacity !== undefined) el.style.opacity = String(value.opacity);
		if (value.transform !== undefined) el.style.transform = value.transform;
		if (value.clipPath !== undefined) el.style.clipPath = value.clipPath;
	}

	#createGhost(el: HTMLElement, rect: DOMRect): HTMLElement {
		const ghost = el.cloneNode(true) as HTMLElement;
		ghost.style.position = 'fixed';
		ghost.style.left = `${rect.left}px`;
		ghost.style.top = `${rect.top}px`;
		ghost.style.width = `${rect.width}px`;
		ghost.style.height = `${rect.height}px`;
		ghost.style.margin = '0';
		ghost.style.display = 'block';
		ghost.style.pointerEvents = 'none';
		document.body.appendChild(ghost);
		return ghost;
	}

	end() {
		for (const tween of this.#tweens) {
			if (tween.mode === 'exit') {
				tween.el.remove();
			} else {
				tween.el.style.transform = '';
				tween.el.style.opacity = '';
				tween.el.style.clipPath = '';
				tween.el.style.transformOrigin = '';
			}
		}
		this.#tweens = [];
	}

	revert() {
		for (const key of Object.keys(this.#snapshot)) {
			this.#state[key] = this.#snapshot[key];
		}
		for (const tween of this.#tweens) {
			if (tween.mode === 'exit') {
				tween.el.remove();
			} else {
				tween.el.style.transform = '';
				tween.el.style.opacity = '';
				tween.el.style.clipPath = '';
				tween.el.style.transformOrigin = '';
			}
		}
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
			const step = this.#steps[i];
			const stepProgress =
				step.duration > 0 ? clamp(progress * (this.duration / step.duration), 0, 1) : progress;
			step.setProgress(stepProgress);
			if (stepProgress >= 1) {
				this.#done[i] = true;
				step.end();
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
	#ease: Easing;
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
		ease: Easing = easeInOut,
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
				color: t.color,
				morph: 'delete',
				from: [t.col, t.line],
				to: null
			}));
			const creates: MorphToken[] = highlight(to, this.#codeState.language).map((t) => ({
				code: t.code,
				color: t.color,
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
