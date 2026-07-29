export interface FrameScheduler {
	request(callback: (now: number) => void): number;
	cancel(id: number): void;
	now(): number;
}

export class RealTimeScheduler implements FrameScheduler {
	request(callback: (now: number) => void): number {
		return requestAnimationFrame(callback);
	}

	cancel(id: number): void {
		cancelAnimationFrame(id);
	}

	now(): number {
		return performance.now();
	}
}

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
	 */
	tick(deltaSeconds: number): number {
		this.#now += deltaSeconds * 1000;
		const batch = this.#callbacks;
		this.#callbacks = [];
		for (const { cb } of batch) cb(this.#now);
		return this.#callbacks.length;
	}
}
