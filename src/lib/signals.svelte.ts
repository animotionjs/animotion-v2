export function signal<T>(value: T) {
	if (typeof value === 'function') {
		let s = $derived(value());
		return {
			get current() {
				return s;
			},
			set current(v) {
				s = v;
			}
		};
	}

	const s = $state({ current: value });
	return s;
}
