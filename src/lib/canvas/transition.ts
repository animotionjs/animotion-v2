import { getOptions, type TransitionConfig, type TransitionPreset } from '../scene/options.js';
import { easeInOut, lerp, type Easing } from './easing.js';
import type { TransitionState } from './scene.js';

export interface ResolvedTransition {
	type: TransitionPreset;
	duration: number;
	ease: Easing;
	/** Slide distance in scene units. */
	distance: number;
	/** Starting and ending scale for the zoom preset. */
	scale: number;
}

/**
 * Resolves a scene transition. `undefined` uses the configured default, while
 * `null` disables the transition completely.
 */
export function resolveTransition(
	config: TransitionConfig | null | undefined
): ResolvedTransition | null {
	const value = config === undefined ? getOptions().transition : config;
	if (!value) return null;
	return {
		type: value.type,
		duration: Math.max(0, value.duration ?? 0.5),
		ease: value.ease ?? easeInOut,
		distance: Math.max(0, value.distance ?? 0),
		scale: value.scale ?? 0.5
	};
}

export function enterTransition(
	transition: ResolvedTransition | null,
	progress: number,
	width: number,
	direction: 'forward' | 'backward'
): TransitionState {
	if (!transition) return { opacity: 1, x: 0, y: 0, scale: 1 };
	const eased = transition.ease(Math.min(1, Math.max(0, progress)));
	const sign = direction === 'forward' ? 1 : -1;
	if (transition.type === 'fade') {
		return { opacity: eased, x: 0, y: 0, scale: 1 };
	}
	if (transition.type === 'zoom') {
		return {
			opacity: eased,
			x: 0,
			y: 0,
			scale: lerp(transition.scale, 1, eased)
		};
	}
	const distance = transition.distance > 0 ? transition.distance : width;
	return {
		opacity: eased,
		x: sign * (1 - eased) * distance,
		y: 0,
		scale: 1
	};
}

export function exitTransition(
	transition: ResolvedTransition | null,
	progress: number,
	width: number,
	direction: 'forward' | 'backward'
): TransitionState {
	if (!transition) return { opacity: 1, x: 0, y: 0, scale: 1 };
	const eased = transition.ease(Math.min(1, Math.max(0, progress)));
	const sign = direction === 'forward' ? 1 : -1;
	if (transition.type === 'fade') {
		return { opacity: 1 - eased, x: 0, y: 0, scale: 1 };
	}
	if (transition.type === 'zoom') {
		return {
			opacity: 1 - eased,
			x: 0,
			y: 0,
			scale: lerp(1, transition.scale, eased)
		};
	}
	const distance = transition.distance > 0 ? transition.distance : width;
	return {
		opacity: 1 - eased,
		x: -sign * eased * distance,
		y: 0,
		scale: 1
	};
}
