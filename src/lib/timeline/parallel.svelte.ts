export function* parallel(
	...generators: Generator<unknown, void, number>[]
): Generator<unknown, void, number> {
	while (true) {
		const delta = yield;
		let allDone = true;
		for (const gen of generators) {
			const result = gen.next(delta);
			if (!result.done) allDone = false;
		}
		if (allDone) return;
	}
}
