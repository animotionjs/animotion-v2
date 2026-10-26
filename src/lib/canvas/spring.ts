import { clamp, type Easing } from './easing.js';
import type { Signal } from './signal.js';
import { Animation } from './steps.js';

export interface SpringOptions {
	/** Spring constant. Higher values settle faster. */
	stiffness?: number;
	/** Resistance. Higher values remove overshoot. */
	damping?: number;
	/** Moving mass. */
	mass?: number;
	/** Initial velocity in signal units per second. */
	velocity?: number;
}

export interface SpringAnimationOptions extends SpringOptions {
	/** Timeline duration. Defaults to `0.8`. */
	duration?: number;
}

/**
 * Builds an easing curve from a damped spring. The curve may overshoot, which
 * is what makes a spring feel different from a fixed easing function.
 */
export function spring(options: SpringOptions = {}): Easing {
	const stiffness = Math.max(1e-4, options.stiffness ?? 170);
	const mass = Math.max(1e-4, options.mass ?? 1);
	const damping = Math.max(0, options.damping ?? 26);
	const velocity = options.velocity ?? 0;
	const omega = Math.sqrt(stiffness / mass);
	const zeta = damping / (2 * Math.sqrt(stiffness * mass));

	const raw = (time: number): number => {
		if (time <= 0) return 0;
		if (Math.abs(zeta - 1) < 1e-6) {
			return 1 - Math.exp(-omega * time) * (1 + (omega + velocity) * time);
		}
		if (zeta < 1) {
			const omegaD = omega * Math.sqrt(1 - zeta * zeta);
			return (
				1 -
				Math.exp(-zeta * omega * time) *
					(Math.cos(omegaD * time) + ((zeta * omega + velocity) / omegaD) * Math.sin(omegaD * time))
			);
		}
		const root = omega * Math.sqrt(zeta * zeta - 1);
		const r1 = -omega * zeta + root;
		const r2 = -omega * zeta - root;
		const a = (-velocity - r2) / (r1 - r2);
		const b = 1 - a;
		return 1 - a * Math.exp(r1 * time) - b * Math.exp(r2 * time);
	};

	const end = raw(1);
	return (progress: number) => {
		const time = clamp(progress, 0, 1);
		if (time <= 0) return 0;
		if (time >= 1) return 1;
		const value = raw(time);
		if (!Number.isFinite(end) || Math.abs(end) < 1e-6) return value;
		return value / end;
	};
}

/** Animates a signal with a spring easing curve. */
export function springTo<T>(
	signal: Signal<T>,
	to: T,
	options: SpringAnimationOptions = {}
): Animation {
	const { duration = 0.8, ...springOptions } = options;
	return signal.to(to, duration, spring(springOptions));
}
