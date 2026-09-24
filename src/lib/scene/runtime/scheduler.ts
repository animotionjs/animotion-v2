/** Frame-loop abstraction so animation can run on real time or deterministically during render. */
export interface FrameScheduler {
	request(callback: (now: number) => void): number;
	cancel(id: number): void;
	now(): number;
}

/** Schedules frames on `requestAnimationFrame` with `performance.now()` time. */
export class RealTimeScheduler implements FrameScheduler {
	request(callback: (now: number) => void): number {
		return requestAnimationFrame(callback);
	}

	cancel(id: number): void {
		if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(id);
	}

	now(): number {
		return performance.now();
	}
}

/**
 * Deterministic scheduler driven by {@link tick}; time advances only when
 * told, making animation reproducible for rendering. Not tied to real time.
 */
export class RenderScheduler implements FrameScheduler {
	#now = 0;
	#callbacks: Array<{ id: number; cb: (now: number) => void }> = [];
	#nextId = 1;

	request(callback: (now: number) => void): number {
		const id = this.#nextId++;
		this.#callbacks.push({ id, cb: callback });
		return id;
	}

	cancel(id: number): void {
		this.#callbacks = this.#callbacks.filter((c) => c.id !== id);
	}

	now(): number {
		return this.#now;
	}

	/**
	 * Advances the clock and runs all pending callbacks.
	 * The callback list is snapshotted before invocation so that callbacks
	 * scheduled during the batch (the normal re-request pattern) populate
	 * a fresh list for the next tick, and cancellations issued during the
	 * batch safely no-op against the already-snapshotted list.
	 *
	 * @param deltaSeconds - seconds to advance the internal clock by
	 * @returns number of callbacks pending for the next tick
	 */
	tick(deltaSeconds: number): number {
		this.#now += deltaSeconds * 1000;
		const batch = this.#callbacks;
		this.#callbacks = [];
		for (const { cb } of batch) cb(this.#now);
		return this.#callbacks.length;
	}
}
