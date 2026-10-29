export type SceneTransition = 'slide' | 'fade' | 'zoom' | 'none';
export type SceneDirection = 'forward' | 'backward';

/**
 * A scene can name one transition for both sides, or set the intro and exit
 * separately. The presentation default fills in anything a scene leaves out.
 */
export type SceneTransitionConfig =
	| SceneTransition
	| {
			enter?: SceneTransition;
			exit?: SceneTransition;
			duration?: number;
	  };

export interface ResolvedSceneTransition {
	enter: SceneTransition;
	exit: SceneTransition;
	duration: number;
}

const SCENE_TRANSITIONS: SceneTransition[] = ['slide', 'fade', 'zoom', 'none'];

export const SCENE_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

export function isSceneTransition(value: unknown): value is SceneTransition {
	return typeof value === 'string' && SCENE_TRANSITIONS.includes(value as SceneTransition);
}

export function resolveSceneTransition(
	config: SceneTransitionConfig | undefined,
	fallback: SceneTransition = 'slide',
	fallbackDuration = 450
): ResolvedSceneTransition {
	if (config === undefined) {
		return { enter: fallback, exit: fallback, duration: fallbackDuration };
	}

	if (typeof config === 'string') {
		return { enter: config, exit: config, duration: fallbackDuration };
	}

	return {
		enter: config.enter ?? fallback,
		exit: config.exit ?? fallback,
		duration: config.duration ?? fallbackDuration
	};
}

/**
 * Keyframes for one side of a scene change. Forward means the new scene comes
 * from the right and the old scene leaves to the left.
 */
export function sceneKeyframes(
	transition: SceneTransition,
	phase: 'enter' | 'exit',
	direction: SceneDirection
): Keyframe[] | null {
	if (transition === 'none') return null;

	if (transition === 'slide') {
		const sign = direction === 'forward' ? 1 : -1;
		return phase === 'enter'
			? [
					{ opacity: 0, transform: `translateX(${sign * 100}%)` },
					{ opacity: 1, transform: 'none' }
				]
			: [
					{ opacity: 1, transform: 'none' },
					{ opacity: 0, transform: `translateX(${-sign * 100}%)` }
				];
	}

	if (transition === 'fade') {
		return phase === 'enter' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
	}

	return phase === 'enter'
		? [
				{ opacity: 0, transform: 'scale(0.94)' },
				{ opacity: 1, transform: 'none' }
			]
		: [
				{ opacity: 1, transform: 'none' },
				{ opacity: 0, transform: 'scale(1.06)' }
			];
}

export function playSceneTransition(
	element: HTMLElement,
	transition: SceneTransition,
	phase: 'enter' | 'exit',
	direction: SceneDirection,
	duration: number
): Animation | null {
	const keyframes = sceneKeyframes(transition, phase, direction);
	if (!keyframes) return null;

	return element.animate(keyframes, {
		duration,
		easing: SCENE_EASING,
		fill: phase === 'exit' ? 'forwards' : 'none'
	});
}

/**
 * Copies the outgoing scene into a layer above the stage and animates the
 * copy. The live scene can then unmount without interrupting the exit.
 */
export function playExitScene(
	layer: HTMLElement,
	root: HTMLElement,
	transition: SceneTransition,
	direction: SceneDirection,
	duration: number
): void {
	layer.replaceChildren();
	if (transition === 'none') return;

	const clone = root.cloneNode(true) as HTMLElement;
	clone.style.pointerEvents = 'none';
	layer.append(clone);

	const animation = playSceneTransition(clone, transition, 'exit', direction, duration);
	if (!animation) {
		clone.remove();
		return;
	}

	/* hidden tabs can stall the document timeline, so time the cleanup too */
	const fallback = window.setTimeout(() => clone.remove(), duration + 100);
	const remove = () => {
		window.clearTimeout(fallback);
		clone.remove();
	};

	animation.finished.then(remove, remove);
}
