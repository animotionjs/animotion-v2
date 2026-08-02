const PREFIX_PATTERN = /^\d+-/;

export function resolveScenes(scenes: string[], all: string[]): string[] {
	const byId = new Map<string, string>();
	for (const id of all) byId.set(id, id);
	for (const id of all) {
		const prefixed = id.replace(PREFIX_PATTERN, '');
		byId.set(prefixed, id);
	}

	const resolved: string[] = [];
	for (const scene of scenes) {
		const key = scene.replace(PREFIX_PATTERN, '');
		const id = byId.get(key);
		if (!id) {
			throw new Error(`Unknown scene "${scene}". Available scenes: ${all.join(', ')}`);
		}
		if (!resolved.includes(id)) resolved.push(id);
	}
	return resolved;
}
