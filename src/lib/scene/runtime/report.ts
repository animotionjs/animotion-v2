/**
 * Progress updates the renderer sends over its IPC channel while it is
 * spawned by the dev server instead of a human terminal. The final outcome
 * is derived from the exit code, so only in flight phases are reported.
 */
export type RenderReport = { type: 'progress'; done: number; total: number } | { type: 'encoding' };

/**
 * Validates an untrusted IPC message as a render report, or returns null
 * when the shape does not match.
 */
export function parseRenderReport(message: unknown): RenderReport | null {
	if (typeof message !== 'object' || message === null) return null;
	const { type, done, total } = message as Record<string, unknown>;
	if (type === 'encoding') return { type };
	if (type === 'progress' && typeof done === 'number' && typeof total === 'number' && total > 0) {
		return { type, done, total };
	}
	return null;
}
