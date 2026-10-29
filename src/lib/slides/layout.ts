export interface LayoutBox {
	element: HTMLElement;
	left: number;
	top: number;
	width: number;
	height: number;
	/** Placement before the step, so grid span changes can use a scale flip. */
	gridRow: string;
	gridColumn: string;
}

export type LayoutSnapshot = Map<string, LayoutBox>;

/**
 * Captures the screen box of every element tagged with `data-layout`. Elements
 * with no painted box are skipped because they cannot be matched later.
 */
export function captureLayout(root: HTMLElement): LayoutSnapshot {
	const snapshot: LayoutSnapshot = new Map();

	for (const element of root.querySelectorAll<HTMLElement>('[data-layout]')) {
		if (element.closest('[data-layout-ghost]')) continue;
		const key = element.dataset.layout;
		if (!key) continue;
		const style = getComputedStyle(element);
		if (style.display === 'none') continue;

		const rect = element.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) continue;

		snapshot.set(key, {
			element,
			left: rect.left,
			top: rect.top,
			width: rect.width,
			height: rect.height,
			gridRow: style.gridRow,
			gridColumn: style.gridColumn
		});
	}

	return snapshot;
}

/**
 * Animates every tagged element from where it was to where it is now. New keys
 * fade in, removed keys fade out through a copy, and retained keys glide and
 * resize.
 */
export function playLayout(root: HTMLElement, before: LayoutSnapshot, duration = 450): void {
	/*
	 * A rapid step change leaves old ghosts and animations behind. Drop them
	 * before measuring so the new animation starts from the real layout.
	 */
	for (const ghost of root.querySelectorAll('[data-layout-ghost]')) ghost.remove();
	for (const box of before.values()) {
		for (const animation of box.element.getAnimations()) animation.cancel();
	}

	const after = captureLayout(root);
	const origin = root.getBoundingClientRect();
	const timing: KeyframeAnimationOptions = {
		duration,
		easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
	};

	for (const [key, next] of after) {
		const previous = before.get(key);
		if (!previous) {
			/*
			 * A container of layout children lets those children animate, so
			 * the container itself appears without a second fade.
			 */
			if (!next.element.querySelector('[data-layout]')) {
				next.element.animate(
					[
						{ opacity: 0, transform: 'scale(0.96)' },
						{ opacity: 1, transform: 'none' }
					],
					timing
				);
			}
			continue;
		}

		const dx = previous.left - next.left;
		const dy = previous.top - next.top;
		const sizeChanged =
			Math.abs(previous.width - next.width) > 0.5 || Math.abs(previous.height - next.height) > 0.5;
		const moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
		if (!moved && !sizeChanged) continue;

		const nextStyle = getComputedStyle(next.element);
		const gridChanged =
			previous.gridRow !== nextStyle.gridRow || previous.gridColumn !== nextStyle.gridColumn;

		/*
		 * Changing a grid item's track span changes the row and column sizes
		 * for its siblings too. Animating width and height there makes the
		 * whole grid breathe, so use a scale flip that leaves the final track
		 * layout in place.
		 */
		if (sizeChanged && gridChanged && next.width > 0 && next.height > 0) {
			const scaleX = previous.width / next.width;
			const scaleY = previous.height / next.height;

			next.element.animate(
				[
					{
						transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`,
						transformOrigin: 'top left'
					},
					{ transform: 'none', transformOrigin: 'top left' }
				],
				timing
			);
			continue;
		}

		const first: Keyframe = {
			transform: `translate(${dx}px, ${dy}px)`,
			transformOrigin: 'top left'
		};
		const last: Keyframe = { transform: 'none', transformOrigin: 'top left' };

		/*
		 * Animating the real box keeps text crisp. Inline elements have no box
		 * to resize, so they only glide. A box that contains a code block is
		 * left alone because the code block animates its own height.
		 */
		const ownsItsBox = next.element.querySelector('[data-code-steps]') !== null;
		if (sizeChanged && !ownsItsBox && nextStyle.display !== 'inline') {
			/*
			 * The new state can add min or max constraints that clamp the
			 * first frame, so the box jumps before the tween starts. Hold the
			 * constraints out of the way until the final frame.
			 */
			first.width = `${previous.width}px`;
			first.height = `${previous.height}px`;
			first.minWidth = '0px';
			first.minHeight = '0px';
			first.maxWidth = 'none';
			first.maxHeight = 'none';

			last.width = `${next.width}px`;
			last.height = `${next.height}px`;
			last.minWidth = '0px';
			last.minHeight = '0px';
			last.maxWidth = 'none';
			last.maxHeight = 'none';
		}

		next.element.animate([first, last], timing);
	}

	for (const [key, previous] of before) {
		if (after.has(key)) continue;
		/*
		 * Removed containers should not leave a ghost of their children. The
		 * children with layout keys animate on their own.
		 */
		if (previous.element.querySelector('[data-layout]')) continue;

		const ghost = previous.element.cloneNode(true) as HTMLElement;
		ghost.removeAttribute('data-layout');
		ghost.setAttribute('data-layout-ghost', '');
		ghost.removeAttribute('data-slide-hidden');
		for (const hidden of ghost.querySelectorAll('[data-slide-hidden]')) {
			hidden.removeAttribute('data-slide-hidden');
		}
		ghost.style.position = 'absolute';
		ghost.style.left = `${previous.left - origin.left}px`;
		ghost.style.top = `${previous.top - origin.top}px`;
		ghost.style.width = `${previous.width}px`;
		ghost.style.height = `${previous.height}px`;
		ghost.style.margin = '0';
		ghost.style.pointerEvents = 'none';
		ghost.style.zIndex = '40';
		root.appendChild(ghost);

		const animation = ghost.animate(
			[
				{ opacity: 1, transform: 'none' },
				{ opacity: 0, transform: 'scale(0.96)' }
			],
			timing
		);
		const fallback = window.setTimeout(() => ghost.remove(), duration + 100);
		const remove = () => {
			window.clearTimeout(fallback);
			ghost.remove();
		};

		animation.finished.then(remove, remove);
	}
}
