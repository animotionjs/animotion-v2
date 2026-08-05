export const items = $state<{ id: number; name: string }[]>([
	{ id: 1, name: 'one' },
	{ id: 2, name: 'two' }
]);

export function removeTwo() {
	const index = items.findIndex((item) => item.id === 2);
	if (index !== -1) items.splice(index, 1);
}

export function addThree() {
	items.push({ id: 3, name: 'three' });
}

export function resetItems() {
	items.splice(0, items.length, { id: 1, name: 'one' }, { id: 2, name: 'two' });
}
