import { flushSync } from 'svelte';
import { clamp, easeInOut, lerp } from './easing';

export function* layout(
	layoutChange: () => void,
	duration = 0.5,
	ease: (t: number) => number = easeInOut
): Generator<unknown, void, number> {
	const elements = [...document.querySelectorAll('[data-layout]')] as HTMLElement[];
	const firstBounds: Record<string, DOMRect> = {};
	for (const el of elements) {
		const rect = el.getBoundingClientRect();
		if (rect.width > 0 && rect.height > 0) {
			firstBounds[el.dataset.layout!] = rect;
		}
	}

	layoutChange();
	flushSync();

	const lastElements = [...document.querySelectorAll('[data-layout]')] as HTMLElement[];
	const tweens = lastElements.flatMap((el) => {
		const curr = el.getBoundingClientRect();
		const prev = firstBounds[el.dataset.layout!];

		if (!prev) {
			// el.style.transform = 'scale(0, 0)';
			return { el, deltaX: 0, deltaY: 0, scaleX: 1, scaleY: 1 };
		}

		const deltaX = prev.left - curr.left;
		const deltaY = prev.top - curr.top;
		const scaleX = prev.width / curr.width;
		const scaleY = prev.height / curr.height;
		el.style.transformOrigin = 'top left';
		el.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`;
		return { el, deltaX, deltaY, scaleX, scaleY };
	});

	let elapsed = 0;
	while (elapsed < duration) {
		const delta = yield;
		elapsed += delta;
		const progress = ease(clamp(elapsed / duration, 0, 1));
		for (const { el, deltaX, deltaY, scaleX, scaleY } of tweens) {
			el.style.transform = `translate(${deltaX * (1 - progress)}px, ${deltaY * (1 - progress)}px) scale(${lerp(scaleX, 1, progress)}, ${lerp(scaleY, 1, progress)})`;
		}
	}
	for (const { el } of tweens) el.style.transform = '';
}
