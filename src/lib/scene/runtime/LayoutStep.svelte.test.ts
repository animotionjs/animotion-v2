import { describe, expect, it, beforeEach } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { LayoutStep } from './steps';
import { linear } from '../easing';
import LayoutEach from './fixtures/LayoutEach.svelte';
import { addThree, removeTwo, resetItems } from './fixtures/items.svelte.js';

function setBody(html: string) {
	document.body.innerHTML = html;
}

function element(selector: string): HTMLElement {
	return document.querySelector(selector) as HTMLElement;
}

/** Parses a `rgb()`/`rgba()` string into channels, alpha defaulting to 1. */
function parseRgba(value: string): number[] {
	const match = value.match(/rgba?\(([\d.]+)[,\s/]+([\d.]+)[,\s/]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/);
	if (!match) return [];
	const [, r, g, b, a] = match;
	return [Number(r), Number(g), Number(b), a === undefined ? 1 : Number(a)];
}

function ghosts(selector: string): HTMLElement[] {
	return [...document.querySelectorAll(selector)].filter(
		(el) => (el as HTMLElement).style.position === 'fixed'
	) as HTMLElement[];
}

/** Long enough to wrap across several lines inside a narrow column. */
const LONG =
	'This is a fairly long paragraph that wraps across multiple lines when rendered at a narrow width so we can exercise multi-line text morphing.';

/** The top-left of the text glyph ink, as it visually appears on screen. */
function inkRect(el: HTMLElement): { left: number; top: number } {
	const range = document.createRange();
	range.selectNodeContents(el);
	const rect = range.getBoundingClientRect();
	return { left: rect.left, top: rect.top };
}

beforeEach(() => {
	document.body.innerHTML = '';
});

describe('LayoutStep', () => {
	it('FLIPs elements present in both states', () => {
		setBody(`
			<div data-layout="a" style="width:100px;height:50px;position:absolute;top:10px;left:10px"></div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				setBody(`
				<div data-layout="a" style="width:100px;height:50px;position:absolute;top:100px;left:100px"></div>
			`);
			},
			0.5
		);
		step.start();

		const el = element('[data-layout="a"]');
		// Pinned at its final spot and transformed back to the previous one,
		// so the position glides at float precision instead of stepping
		// through device pixels.
		expect(el.style.position).toBe('absolute');
		expect(el.style.left).toBe('100px');
		expect(el.style.top).toBe('100px');
		expect(el.style.transform).toBe('translate(-90px, -90px)');

		step.setProgress(0.5);
		expect(el.style.transform).toBe('translate(-45px, -45px)');

		step.setProgress(1);
		expect(el.style.transform).toBe('translate(0px, 0px)');

		step.end();
		expect(el.style.left).toBe('');
		expect(el.style.top).toBe('');
		expect(el.style.width).toBe('');
	});

	it('morphs a resized element via width and height', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.width = '200px';
				element('[data-layout="a"]').style.height = '80px';
			},
			0.5,
			{ scale: false }
		);
		step.start();

		// The box is pinned at its final size and its width/height are lerped
		// back to the previous bounds, so content (text, images) rasterizes at
		// native size instead of being scaled and blurred.
		const el = element('[data-layout="a"]');
		expect(el.style.width).toBe('100px');
		expect(el.style.height).toBe('50px');
		expect(el.style.transform).toBe('');
		expect(el.style.minWidth).toBe('auto');
		expect(el.style.maxWidth).toBe('none');
		expect(el.getBoundingClientRect().width).toBeCloseTo(100, 1);
		expect(el.getBoundingClientRect().height).toBeCloseTo(50, 1);

		step.setProgress(0.5);
		expect(el.style.width).toBe('150px');
		expect(el.style.height).toBe('65px');

		step.setProgress(1);
		expect(el.style.width).toBe('200px');
		expect(el.style.height).toBe('80px');

		step.end();
		expect(el.style.width).toBe('');
		expect(el.style.height).toBe('');
		expect(el.style.transform).toBe('');
		expect(el.style.minWidth).toBe('');
	});

	it('morphs a resized element via transform scale by default', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.width = '200px';
				element('[data-layout="a"]').style.height = '80px';
			},
			0.5
		);
		step.start();

		// The default morph pins the final size and scales the box back to the
		// previous bounds, gliding to identity — no width/height re-layout.
		const el = element('[data-layout="a"]');
		expect(el.style.width).toBe('200px');
		expect(el.style.transform).toBe('translate(0px, 0px) scale(0.5, 0.625)');

		step.setProgress(0.5);
		expect(el.style.transform).toBe('translate(0px, 0px) scale(0.75, 0.8125)');

		step.setProgress(1);
		expect(el.style.transform).toBe('translate(0px, 0px) scale(1, 1)');

		step.end();
		expect(el.style.transform).toBe('');
	});

	it('lands pixel-exact at the natural layout when the step ends', () => {
		setBody(`
			<div data-layout="b">b</div>
			<div data-layout="a">a</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				// Removing the sibling is a persistent DOM change: after end()
				// clears the pinning, the element's natural layout is exactly
				// where the FLIP left it.
				element('[data-layout="b"]').remove();
			},
			0.5
		);
		step.start();

		// The element glides up to its final spot; at progress 1 the transform
		// is identity and the pinned geometry equals the natural layout, so
		// clearing the styles in end() must not move or resize it by even a
		// sub-pixel.
		const el = element('[data-layout="a"]');
		expect(el.style.transform).not.toBe('');
		step.setProgress(1);
		const pinned = el.getBoundingClientRect();
		step.end();
		const settled = el.getBoundingClientRect();
		expect(settled.x).toBeCloseTo(pinned.x, 6);
		expect(settled.y).toBeCloseTo(pinned.y, 6);
		expect(settled.width).toBeCloseTo(pinned.width, 6);
		expect(settled.height).toBeCloseTo(pinned.height, 6);
		expect(el.style.transform).toBe('');
		expect(el.style.position).toBe('');
	});

	it('starts a resized centered element from its previous position', () => {
		setBody(`
			<div style="position:absolute;top:0;left:0;display:flex;align-items:center;justify-content:center;width:400px;height:300px">
				<div data-layout="a" style="width:100px;height:50px"></div>
			</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.width = '200px';
				element('[data-layout="a"]').style.height = '100px';
			},
			0.5
		);
		step.start();

		// Pinned at the final (centered) bounds, with the transform scaling
		// and translating back to the previous (also centered) bounds, so the
		// first frame lands where the element was rather than being pushed.
		const el = element('[data-layout="a"]');
		const rect = el.getBoundingClientRect();
		expect(rect.x).toBe(150);
		expect(rect.y).toBe(125);
		expect(el.style.position).toBe('absolute');
		expect(el.style.left).toBe('100px');
		expect(el.style.top).toBe('100px');
		expect(el.style.transform).toBe('translate(50px, 25px) scale(0.5, 0.5)');

		step.end();
	});

	it('counter-scales children so they stay crisp while their box grows (scale: true)', () => {
		setBody(`
			<div data-layout="box" style="width:100px;height:100px">
				<div data-layout="child" style="width:40px;height:20px">text</div>
			</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="box"]').style.width = '200px';
				element('[data-layout="box"]').style.height = '200px';
			},
			0.5,
			{ scale: true }
		);
		step.start();

		const box = element('[data-layout="box"]');
		const child = element('[data-layout="child"]');
		expect(box.style.transform).toBe('translate(0px, 0px) scale(0.5, 0.5)');
		// The box scales to half; the child cancels it with scale(2) so its
		// rendered size stays 40px and it stays anchored at the box's top-left.
		expect(child.style.transform).toBe('translate(0px, 0px) scale(2, 2)');
		expect(child.getBoundingClientRect().width).toBeCloseTo(40, 1);
		expect(child.getBoundingClientRect().x).toBeCloseTo(box.getBoundingClientRect().x, 0);

		step.setProgress(0.5);
		expect(child.getBoundingClientRect().width).toBeCloseTo(40, 1);
		expect(child.getBoundingClientRect().x).toBeCloseTo(box.getBoundingClientRect().x, 0);

		step.setProgress(1);
		expect(child.style.transform).toBe('translate(0px, 0px) scale(1, 1)');

		step.end();
		expect(child.style.transform).toBe('');
	});

	it('keeps children crisp by morphing the box width and height', () => {
		setBody(`
			<div data-layout="box" style="width:100px;height:100px">
				<div data-layout="child" style="width:40px;height:20px">text</div>
			</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="box"]').style.width = '200px';
				element('[data-layout="box"]').style.height = '200px';
			},
			0.5,
			{ scale: false }
		);
		step.start();

		const box = element('[data-layout="box"]');
		const child = element('[data-layout="child"]');
		// The box morphs its width/height (no scale), so the child never gets
		// scaled or stretched and needs no counter-transform to stay crisp.
		expect(box.style.width).toBe('100px');
		expect(box.style.transform).toBe('');
		expect(child.style.transform).toBe('');
		expect(child.getBoundingClientRect().width).toBeCloseTo(40, 1);
		expect(child.getBoundingClientRect().x).toBeCloseTo(box.getBoundingClientRect().x, 0);

		step.setProgress(0.5);
		expect(box.style.width).toBe('150px');
		expect(child.getBoundingClientRect().width).toBeCloseTo(40, 1);
		expect(child.getBoundingClientRect().x).toBeCloseTo(box.getBoundingClientRect().x, 0);

		step.setProgress(1);
		expect(box.style.width).toBe('200px');

		step.end();
		expect(box.style.transform).toBe('');
		expect(child.style.transform).toBe('');
	});

	it('keeps a constant-font direct-text child crisp against its anisotropic box (scale: true)', () => {
		setBody(`
			<div data-layout="box" style="width:100px;height:100px">
				<div data-layout="title" style="font-size:20px">Title</div>
			</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				const box = element('[data-layout="box"]');
				box.style.width = '200px';
				box.style.height = '50px';
			},
			0.5,
			{ scale: true }
		);
		step.start();

		// The title's box resizes with the box, but its font-size is unchanged,
		// so it is treated as position-only: it never gets its own scale, only
		// the counter-scale against the box's anisotropic morph (net scale 1),
		// keeping its glyphs crisp the whole way through.
		const title = element('[data-layout="title"]');
		expect(ghosts('[data-layout="title"]').length).toBe(0);
		expect(title.style.visibility).toBe('');
		expect(title.style.width).toBe('200px');
		expect(title.style.transform).toBe('translate(0px, 0px) scale(2, 0.5)');

		step.setProgress(0.5);
		step.setProgress(1);
		expect(title.style.transform).toBe('translate(0px, 0px) scale(1, 1)');

		step.end();
		expect(title.style.transform).toBe('');
		expect(title.style.width).toBe('');
	});

	it('keeps a child pinned to its previous absolute spot while its box flies and scales', () => {
		setBody(`
			<div data-layout="box" style="position:absolute;top:100px;left:100px;width:100px;height:100px">
				<div data-layout="title" style="font-size:20px">Title</div>
			</div>
		`);
		const title = element('[data-layout="title"]');
		const before = title.getBoundingClientRect();
		const step = new LayoutStep(
			{},
			() => {
				const box = element('[data-layout="box"]');
				box.style.top = '10px';
				box.style.left = '10px';
				box.style.width = '200px';
				box.style.height = '200px';
				// The title reflows so it ends up at the same absolute spot it
				// was in before: only the box itself moved (100 → 10), so the
				// title must compensate for the box's movement on its own.
				const titleEl = element('[data-layout="title"]');
				titleEl.style.position = 'absolute';
				titleEl.style.top = '90px';
				titleEl.style.left = '90px';
			},
			0.5
		);
		step.start();

		const box = element('[data-layout="box"]');
		expect(box.style.transform).toBe('translate(90px, 90px) scale(0.5, 0.5)');
		// The local offset (the box moved 90px) feeds the counter-scale so the
		// text lands exactly on its previous absolute spot instead of gliding
		// under the box's movement.
		expect(title.style.transform).toBe('translate(-90px, -90px) scale(2, 2)');
		expect(title.getBoundingClientRect().left).toBeCloseTo(before.left, 1);
		expect(title.getBoundingClientRect().top).toBeCloseTo(before.top, 1);

		step.setProgress(1);
		expect(title.style.transform).toBe('translate(0px, 0px) scale(1, 1)');
		expect(title.getBoundingClientRect().left).toBeCloseTo(before.left, 1);
		expect(title.getBoundingClientRect().top).toBeCloseTo(before.top, 1);

		step.end();
	});

	it('keeps a size-morphing child from inheriting its box scale (scale: true)', () => {
		setBody(`
			<div data-layout="box" style="width:100px;height:100px">
				<div data-layout="child" style="width:80px;height:20px"></div>
			</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="box"]').style.width = '200px';
				element('[data-layout="child"]').style.width = '40px';
			},
			0.5,
			{ scale: true }
		);
		step.start();

		const box = element('[data-layout="box"]');
		const child = element('[data-layout="child"]');
		expect(box.style.transform).toBe('translate(0px, 0px) scale(0.5, 1)');
		// The child's own morph (80→40) is scale 2, divided by the box's 0.5
		// so the box's scale isn't inherited on top: it renders at its old
		// width (80), not 80 × 0.5.
		expect(child.style.transform).toBe('translate(0px, 0px) scale(4, 1)');
		expect(child.getBoundingClientRect().width).toBeCloseTo(80, 1);

		step.setProgress(0.5);
		expect(child.getBoundingClientRect().width).toBeCloseTo(60, 1);

		step.setProgress(1);
		expect(child.style.transform).toBe('translate(0px, 0px) scale(1, 1)');

		step.end();
		expect(child.style.transform).toBe('');
	});

	it('morphs a size-changing child via width and height', () => {
		setBody(`
			<div data-layout="box" style="width:100px;height:100px">
				<div data-layout="child" style="width:80px;height:20px"></div>
			</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="box"]').style.width = '200px';
				element('[data-layout="child"]').style.width = '40px';
			},
			0.5,
			{ scale: false }
		);
		step.start();

		const box = element('[data-layout="box"]');
		const child = element('[data-layout="child"]');
		expect(box.style.transform).toBe('');
		// Both boxes morph width; the child's own width goes 80 → 40 without
		// any scale, so it renders at its previous width (80) at the start.
		expect(child.style.transform).toBe('');
		expect(child.style.width).toBe('80px');
		expect(child.getBoundingClientRect().width).toBeCloseTo(80, 1);

		step.setProgress(0.5);
		expect(child.getBoundingClientRect().width).toBeCloseTo(60, 1);

		step.setProgress(1);
		expect(child.style.width).toBe('40px');
		expect(child.getBoundingClientRect().width).toBeCloseTo(40, 1);

		step.end();
		expect(child.style.transform).toBe('');
	});

	it('counter-scales border-radius so corners stay put while the box grows (scale: true)', () => {
		setBody('<div data-layout="a" style="width:100px;height:100px;border-radius:16px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.width = '200px';
			},
			0.5,
			{ scale: true }
		);
		step.start();

		const el = element('[data-layout="a"]');
		// Height doesn't change (y-scale 1), so only the horizontal radius is
		// counter-scaled: 16px set in a box scaled 0.5 renders 16px.
		expect(el.style.borderRadius).toBe('32px / 16px');

		step.setProgress(1);
		expect(el.style.borderRadius).toBe('16px');

		step.end();
		// The author's inline radius survives the step (only animated props
		// are restored to their own values; this one was never cleared).
		expect(el.style.borderRadius).toBe('16px');
	});

	it('keeps a constant border-radius while the box grows', () => {
		setBody('<div data-layout="a" style="width:100px;height:100px;border-radius:16px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.width = '200px';
			},
			0.5,
			{ scale: false }
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.width).toBe('100px');
		// No scale, so the radius isn't stretched (kept at its inline 16px)
		// and needs no counter-scale.
		expect(el.style.borderRadius).toBe('16px');

		step.setProgress(1);
		expect(el.style.borderRadius).toBe('16px');

		step.end();
		// A constant inline radius isn't animated, so it must survive the step
		// rather than being wiped to ''.
		expect(el.style.borderRadius).toBe('16px');
	});

	it('morphs border-radius when it changes', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px;border-radius:0px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.borderRadius = '20px';
			},
			0.5
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.borderRadius).toBe('0px');

		step.setProgress(0.5);
		expect(parseFloat(el.style.borderRadius)).toBe(10);

		step.setProgress(1);
		step.end();
		expect(el.style.borderRadius).toBe('20px');
	});

	it('clamps an oversized border-radius to the box size', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px;border-radius:0px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.borderRadius = '9999px';
			},
			0.5
		);
		step.start();

		// Anything above min(width, height) / 2 = 25px renders fully round
		// anyway, so the tween is capped there to keep the morph visible.
		const el = element('[data-layout="a"]');
		expect(el.style.borderRadius).toBe('0px');

		step.setProgress(0.5);
		expect(parseFloat(el.style.borderRadius)).toBe(12.5);

		step.setProgress(1);
		expect(parseFloat(el.style.borderRadius)).toBe(25);

		step.end();
		expect(el.style.borderRadius).toBe('9999px');
	});

	it('morphs a rounded-full radius reported in scientific notation', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px;border-radius:0px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				// Chrome's computed value for `rounded-full` (calc(infinity * 1px)).
				element('[data-layout="a"]').style.borderRadius = '3.35544e+07px';
			},
			0.5
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.borderRadius).toBe('0px');

		step.setProgress(0.5);
		expect(parseFloat(el.style.borderRadius)).toBe(12.5);

		step.setProgress(1);
		step.end();
		expect(el.style.borderRadius).toBe('3.35544e+07px');
	});

	it('morphs background-color when it changes', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px;background-color:#000"></div>');
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.backgroundColor = '#ffffff';
			},
			0.5
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.backgroundColor).toBe('rgb(0, 0, 0)');

		step.setProgress(0.5);
		expect(el.style.backgroundColor).toMatch(/^rgba?\(128, 128, 128/);

		step.setProgress(1);
		step.end();
		expect(el.style.backgroundColor).toBe('rgb(255, 255, 255)');
	});

	it('morphs oklch colors (Tailwind palette)', () => {
		setBody(
			'<div data-layout="a" style="width:100px;height:50px;background-color:oklch(0.828 0.189 84.429)"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.backgroundColor = 'oklch(0.777 0.152 181.912)';
			},
			0.5
		);
		step.start();

		const el = element('[data-layout="a"]');
		// amber-400 (oklch) converts to rgb(255, 185, 0); teal-400 to
		// rgb(0, 213, 190). Chromium reports teal as rgb(1, 212, 190) — the
		// couple-unit gap is gamma rounding, invisible in practice.
		expect(parseRgba(el.style.backgroundColor)).toEqual([255, 185, 0, 1]);

		step.setProgress(0.5);
		const mid = parseRgba(el.style.backgroundColor);
		expect(mid[0]).toBe(Math.round((255 + 0) / 2));
		expect(mid[1]).toBe(Math.round((185 + 213) / 2));
		expect(mid[2]).toBe(Math.round((0 + 190) / 2));

		step.setProgress(1);
		expect(parseRgba(el.style.backgroundColor)).toEqual([0, 213, 190, 1]);

		step.end();
		expect(el.style.backgroundColor).toBe('oklch(0.777 0.152 181.912)');
	});

	it('morphs oklab colors with alpha (opacity modifiers)', () => {
		setBody(
			'<div data-layout="a" style="width:100px;height:50px;background-color:oklab(0.828 0.018 0.188 / 0.5)"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.backgroundColor = 'oklab(0.5 0 0 / 0.8)';
			},
			0.5
		);
		step.start();

		const el = element('[data-layout="a"]');
		const start = parseRgba(el.style.backgroundColor);
		expect(start.slice(0, 3)).toEqual([255, 186, 0]);
		expect(start[3]).toBe(0.5);

		step.setProgress(1);
		const end = parseRgba(el.style.backgroundColor);
		expect(end.slice(0, 3)).toEqual([99, 99, 99]);
		expect(end[3]).toBe(0.8);

		step.end();
		expect(el.style.backgroundColor).toBe('oklab(0.5 0 0 / 0.8)');
	});

	it('morphs between hex and oklch colors', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px;background-color:#fbbf24"></div>');
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.backgroundColor = 'oklch(0.777 0.152 181.912)';
			},
			0.5
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(parseRgba(el.style.backgroundColor).slice(0, 3)).toEqual([251, 191, 36]);

		step.setProgress(1);
		expect(parseRgba(el.style.backgroundColor).slice(0, 3)).toEqual([0, 213, 190]);

		step.end();
		expect(el.style.backgroundColor).toBe('oklch(0.777 0.152 181.912)');
	});

	it('morphs border-color when it changes', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px;border:4px solid #000"></div>');
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.borderColor = '#ffffff';
			},
			0.5
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(parseRgba(el.style.borderColor).slice(0, 3)).toEqual([0, 0, 0]);

		step.setProgress(0.5);
		expect(parseRgba(el.style.borderColor)[0]).toBe(128);

		step.setProgress(1);
		expect(parseRgba(el.style.borderColor).slice(0, 3)).toEqual([255, 255, 255]);

		step.end();
		expect(el.style.borderColor).toBe('rgb(255, 255, 255)');
	});

	it('does not tween border-color when either state has no visible border', () => {
		// A borderless box computes `border-color` as currentColor (white in
		// this presentation) even though nothing renders, so a key that moves
		// onto a 2px-bordered element would otherwise paint a white frame that
		// scales with the morph. The bordered element's color comes from a
		// class (as in real scenes), so an engine write would show up inline.
		setBody('<div data-layout="a" style="width:200px;height:80px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				setBody(`
					<style>.bordered { border: 2px solid transparent }</style>
					<div data-layout="a" class="bordered" style="width:100px;height:50px"></div>
				`);
			},
			0.5
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.borderColor).toBe('');

		step.setProgress(0.5);
		expect(el.style.borderColor).toBe('');
		// The class stays authoritative: no inline color left behind.
		expect(getComputedStyle(el).borderTopColor).toBe('rgba(0, 0, 0, 0)');

		step.end();
		expect(el.style.borderColor).toBe('');
	});

	it('preserves an author inline background-color that does not change', () => {
		setBody(
			'<div data-layout="a" style="width:100px;height:50px;background-color:rgb(255, 100, 100)"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.height = '100px';
			},
			0.5
		);
		step.start();
		step.setProgress(1);
		step.end();

		// The color never changed, so the step never tweened it and must leave
		// the author's inline value (e.g. a Svelte `style:background-color`
		// directive) untouched instead of wiping it.
		expect(element('[data-layout="a"]').style.backgroundColor).toBe('rgb(255, 100, 100)');
	});

	it('restores a class-driven color to its final class instead of freezing it inline', () => {
		setBody(`
			<style>.red { background-color: red } .blue { background-color: blue }</style>
			<div data-layout="a" class="red" style="width:100px;height:50px"></div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').className = 'blue';
			},
			0.5
		);
		step.start();
		step.setProgress(1);
		step.end();

		// The color was tweened, but its source is the class: after the step
		// the inline style must be gone so the (new) class stays authoritative.
		const el = element('[data-layout="a"]');
		expect(el.style.backgroundColor).toBe('');
		expect(getComputedStyle(el).backgroundColor).toBe('rgb(0, 0, 255)');
	});

	it('animates font-size frame by frame so text grows instead of being scaled', () => {
		setBody('<div data-layout="a" style="font-size:16px">text</div>');
		let beforeHeight = 0;
		let beforeInkWidth = 0;
		const step = new LayoutStep(
			{},
			() => {
				const before = element('[data-layout="a"]');
				beforeHeight = before.getBoundingClientRect().height;
				const range = document.createRange();
				range.selectNodeContents(before);
				beforeInkWidth = range.getBoundingClientRect().width;
				element('[data-layout="a"]').style.fontSize = '32px';
			},
			0.5
		);
		const inkWidth = () => {
			const range = document.createRange();
			range.selectNodeContents(element('[data-layout="a"]'));
			return range.getBoundingClientRect().width;
		};
		step.start();

		/*
			The computed font lerps each frame and the box hugs the text (auto
			height), so the block grows exactly as much as its glyphs do. A
			pure font morph needs no transform at all.
		*/
		const el = element('[data-layout="a"]');
		expect(el.style.transform).toBe('');
		expect(el.getBoundingClientRect().height).toBeCloseTo(beforeHeight, 6);

		step.setProgress(0.5);
		const midFont = parseFloat(el.style.fontSize);
		expect(midFont).toBeGreaterThan(16);
		expect(midFont).toBeLessThan(32);
		const midHeight = el.getBoundingClientRect().height;
		expect(midHeight).toBeGreaterThan(beforeHeight);
		const midInkWidth = inkWidth();
		expect(midInkWidth).toBeGreaterThan(beforeInkWidth);

		step.setProgress(0.75);
		expect(inkWidth()).toBeGreaterThan(midInkWidth);

		step.setProgress(1);
		expect(el.style.fontSize).toBe('32px');

		step.end();
		// The author's inline font-size survives the step.
		expect(el.style.fontSize).toBe('32px');
	});

	it('starts font-changing text on its previous glyph ink', () => {
		/*
			A fixed line-height makes the ink sit at a different offset within
			the box at each font size. Inline-block makes the box shrink-wrap
			the text, so the font change also changes its size.
		*/
		setBody(
			'<div data-layout="a" style="font-size:16px;line-height:60px;display:inline-block">text</div>'
		);
		const el = element('[data-layout="a"]');
		const before = inkRect(el);
		const step = new LayoutStep(
			{},
			() => {
				el.style.fontSize = '32px';
			},
			0.5
		);
		step.start();

		/*
			The element truly starts at its previous layout, lerped font and
			lerped bounds included, so its ink lands exactly where the smaller
			text was, with no transform compensation.
		*/
		expect(el.style.fontSize).toBe('16px');
		const atStart = inkRect(el);
		expect(atStart.left).toBeCloseTo(before.left, 1);
		expect(atStart.top).toBeCloseTo(before.top, 1);

		step.setProgress(1);
		expect(el.style.transform).toBe('');

		step.end();
	});

	it('re-wraps a multi-line paragraph as its font grows (scale: false)', () => {
		setBody(`<p data-layout="a" style="font-size:16px;width:140px">${LONG}</p>`);
		let prevTop = 0;
		let prevHeight = 0;
		const step = new LayoutStep(
			{},
			() => {
				const el = element('[data-layout="a"]');
				const rect = el.getBoundingClientRect();
				prevTop = rect.top;
				prevHeight = rect.height;
				el.style.fontSize = '32px';
			},
			0.5,
			{ scale: false }
		);
		step.start();

		/*
			The paragraph starts exactly on its previous layout, not on a
			scaled-down copy of the final wrap, then re-wraps natively as the
			font lerps, so there is no first-frame snap. A transform may ride
			along because the UA's em-based paragraph margin grows with the
			font.
		*/
		const el = element('[data-layout="a"]');
		expect(el.style.fontSize).toBe('16px');
		expect(el.getBoundingClientRect().top).toBeCloseTo(prevTop, 1);
		expect(el.getBoundingClientRect().height).toBeCloseTo(prevHeight, 1);

		step.setProgress(0.5);
		const midFont = parseFloat(el.style.fontSize);
		expect(midFont).toBeGreaterThan(16);
		expect(midFont).toBeLessThan(32);
		const midRect = el.getBoundingClientRect();
		expect(midRect.height).toBeGreaterThan(prevHeight * 0.9);
		/*
			The box hugs the current wrap: the text's ink bottom sits flush
			with the box's bottom edge instead of floating inside a lerped
			height (or poking past it).
		*/
		const contentRange = document.createRange();
		contentRange.selectNodeContents(el);
		const contentBottom = contentRange.getBoundingClientRect().bottom;
		expect(contentBottom).toBeLessThan(midRect.bottom + 2);
		expect(midRect.bottom).toBeLessThan(contentBottom + 2);

		step.setProgress(1);
		expect(el.style.fontSize).toBe('32px');

		step.end();
	});

	it('grows a nested paragraph while its parent stretches around it (scale: true)', () => {
		setBody(
			`<div data-layout="box" style="width:200px;height:200px"><p data-layout="para" style="font-size:16px;width:180px">${LONG}</p></div>`
		);
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="box"]').style.width = '300px';
				const p = element('[data-layout="para"]');
				p.style.width = '280px';
				p.style.fontSize = '32px';
			},
			0.5,
			{ scale: true }
		);
		step.start();

		const para = element('[data-layout="para"]');
		/*
			The paragraph tweens its own font starting from the previous size;
			its only transform is the counter-scale against the box, so the
			glyphs re-wrap natively instead of riding a stretched final wrap.
		*/
		expect(para.style.fontSize).toBe('16px');
		expect(para.style.transform).not.toBe('');

		step.setProgress(0.5);
		const midFont = parseFloat(para.style.fontSize);
		expect(midFont).toBeGreaterThan(16);
		expect(midFont).toBeLessThan(32);

		step.setProgress(1);
		expect(para.style.fontSize).toBe('32px');

		step.end();
	});

	it('fades in newly-appeared elements by default', () => {
		setBody('');
		const step = new LayoutStep(
			{},
			() => {
				setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
			},
			0.5
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.opacity).toBe('0');

		step.setProgress(0.5);
		expect(el.style.opacity).toBe('0.5');

		step.setProgress(1);
		step.end();
		expect(el.style.opacity).toBe('');
	});

	it('applies a custom ease from options', () => {
		setBody('');
		const step = new LayoutStep(
			{},
			() => {
				setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
			},
			0.5,
			{ enter: 'scale', ease: () => 0 }
		);
		step.start();

		const el = element('[data-layout="a"]');
		step.setProgress(1);
		expect(el.style.transform).toBe('scale(0)');
	});

	it('scales in when enter is scale', () => {
		setBody('');
		const step = new LayoutStep(
			{},
			() => {
				setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
			},
			0.5,
			{ enter: 'scale' }
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.transform).toBe('scale(0)');
		expect(el.style.transformOrigin).toMatch(/center/);

		step.setProgress(0.5);
		expect(el.style.transform).toBe('scale(0.5)');

		step.end();
		expect(el.style.transform).toBe('');
	});

	it('clips in with a circle reveal when enter is clip', () => {
		setBody('');
		const step = new LayoutStep(
			{},
			() => {
				setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
			},
			0.5,
			{ enter: 'clip' }
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.clipPath).toBe('circle(0% at 50% 50%)');

		step.setProgress(0.5);
		expect(el.style.clipPath).toBe('circle(50% at 50% 50%)');

		step.end();
		expect(el.style.clipPath).toBe('');
	});

	it('wipes in left-to-right when enter is wipe', () => {
		setBody('');
		const step = new LayoutStep(
			{},
			() => {
				setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
			},
			0.5,
			{ enter: 'wipe' }
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.clipPath).toMatch(/inset\(0px? 100% 0px? 0px?\)/);

		step.setProgress(0.5);
		expect(el.style.clipPath).toMatch(/inset\(0px? 50% 0px? 0px?\)/);

		step.end();
		expect(el.style.clipPath).toBe('');
	});

	it('writes no styles when enter is none', () => {
		setBody('');
		const step = new LayoutStep(
			{},
			() => {
				setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
			},
			0.5,
			{ enter: 'none' }
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.opacity).toBe('');
		expect(el.style.transform).toBe('');
		expect(el.style.clipPath).toBe('');
	});

	it('spawns a ghost that fades out when an element is removed from the DOM', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				setBody('');
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		expect(ghosts('[data-layout="a"]').length).toBe(1);
		const ghost = ghosts('[data-layout="a"]')[0];
		expect(ghost.style.opacity).toBe('1');

		// The exit completes by `exitEnd` (default 1): the ghost fades out
		// across the whole step.
		step.setProgress(0.05);
		expect(ghost.style.opacity).toBe('0.95');

		step.setProgress(0.1);
		expect(ghost.style.opacity).toBe('0.9');

		step.setProgress(1);
		expect(ghost.style.opacity).toBe('0');

		step.end();
		expect(ghosts('[data-layout="a"]').length).toBe(0);
	});

	it('pins the source text metrics on the ghost so exiting text keeps its size', () => {
		// The font resolves against the parent (0.5em of 24px = 12px); as a
		// body child the clone would compute 0.5em of 16px = 8px instead.
		setBody(
			'<div style="font-size:24px"><div data-layout="a" style="font-size:0.5em">Text</div></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				setBody('');
			},
			0.5
		);
		step.start();

		const ghost = ghosts('[data-layout="a"]')[0];
		expect(parseFloat(getComputedStyle(ghost).fontSize)).toBe(12);
		expect(ghost.style.fontSize).toBe('12px');

		step.end();
		expect(ghosts('[data-layout="a"]').length).toBe(0);
	});

	it('pins the source color on the ghost so currentColor survives the move to body', () => {
		// The SVG's `currentColor` stroke resolves against the parent's white
		// text color; as a body child the clone would inherit the body's black
		// color instead and the exiting arrow would be invisible on dark.
		setBody(
			'<div style="color:rgb(255, 255, 255)"><svg data-layout="a" stroke="currentColor"></svg></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				setBody('');
			},
			0.5
		);
		step.start();

		const ghost = ghosts('[data-layout="a"]')[0];
		expect(ghost.style.color).toBe('rgb(255, 255, 255)');

		step.end();
		expect(ghosts('[data-layout="a"]').length).toBe(0);
	});

	it('spawns one ghost when an exiting element has a data-layout descendant', () => {
		setBody('<div data-layout="a"><span data-layout="a-text">Text</span></div>');
		const step = new LayoutStep(
			{},
			() => {
				setBody('');
			},
			0.5
		);
		step.start();

		// The card ghost's clone already carries the nested text, so a
		// second ghost for the span would render it twice on exit.
		expect(ghosts('[data-layout="a"]').length).toBe(1);
		expect(ghosts('[data-layout="a-text"]').length).toBe(0);
		expect(ghosts('[data-layout="a"]')[0].textContent).toBe('Text');

		step.end();
		expect(ghosts('[data-layout="a"]').length).toBe(0);
	});

	it('ghosts a reused element with its pre-change content', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px">OLD</div>');
		const step = new LayoutStep(
			{},
			() => {
				// The same node is reused: its `data-layout` key and content are
				// rewritten in place, so the exit ghost must render what was
				// actually on screen before the change, not the new content.
				const el = element('[data-layout="a"]');
				el.dataset.layout = 'b';
				el.textContent = 'NEW';
			},
			0.5
		);
		step.start();

		const ghost = ghosts('[data-layout="a"]')[0];
		expect(ghost.textContent).toBe('OLD');

		step.end();
		expect(ghosts('[data-layout="a"]').length).toBe(0);
	});

	it('preserves the source display so nested content stays centered on exit', () => {
		setBody(
			'<div data-layout="a" style="display:grid;width:100px;height:50px;place-items:center"><span>Text</span></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				setBody('');
			},
			0.5
		);
		step.start();

		expect(ghosts('[data-layout="a"]')[0].style.display).toBe('grid');

		step.end();
		expect(ghosts('[data-layout="a"]').length).toBe(0);
	});

	it('spawns a ghost when an element is hidden with display:none', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.display = 'none';
			},
			0.5
		);
		step.start();

		expect(ghosts('[data-layout="a"]').length).toBe(1);
		expect(ghosts('[data-layout="a"]')[0].style.display).toBe('block');
		expect(ghosts('[data-layout="a"]')[0].style.position).toBe('fixed');
	});

	it('scales out when exit is scale', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				setBody('');
			},
			0.5,
			{ exit: 'scale', ease: linear }
		);
		step.start();

		const ghost = ghosts('[data-layout="a"]')[0];
		expect(ghost.style.transform).toBe('scale(1)');

		// The exit completes by `exitEnd` (default 1), so it is fully
		// scaled away only at the step's end.
		step.setProgress(0.1);
		expect(ghost.style.transform).toBe('scale(0.9)');

		step.setProgress(1);
		expect(ghost.style.transform).toBe('scale(0)');

		step.end();
		expect(ghosts('[data-layout="a"]').length).toBe(0);
	});

	it('clips out when exit is clip', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				setBody('');
			},
			0.5,
			{ exit: 'clip', ease: linear }
		);
		step.start();

		const ghost = ghosts('[data-layout="a"]')[0];
		expect(ghost.style.clipPath).toBe('circle(100% at 50% 50%)');

		// Fully clipped away by the step's end (`exitEnd` default 1).
		step.setProgress(0.1);
		expect(ghost.style.clipPath).toBe('circle(90% at 50% 50%)');

		step.setProgress(1);
		expect(ghost.style.clipPath).toBe('circle(0% at 50% 50%)');

		step.end();
	});

	it('spawns no ghost when exit is none', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				setBody('');
			},
			0.5,
			{ exit: 'none' }
		);
		step.start();

		expect(ghosts('[data-layout="a"]').length).toBe(0);
	});

	it('rides a retained ancestor that moves and shrinks', () => {
		setBody(`
			<div data-layout="card" style="position:absolute;left:100px;top:100px;width:200px;height:200px">
				<div data-layout="item" style="position:absolute;left:120px;top:130px;width:40px;height:40px"></div>
			</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				// The card survives but glides to the top-left corner while
				// shrinking in half; the item is removed.
				setBody(`
					<div data-layout="card" style="position:absolute;left:0px;top:0px;width:100px;height:100px"></div>
				`);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		// Pinned at its pre-change viewport spot, the ghost is transformed back
		// onto the card's old position at the start of the ride.
		const ghost = ghosts('[data-layout="item"]')[0];
		expect(ghost.style.position).toBe('fixed');
		expect(ghost.style.left).toBe('220px');
		expect(ghost.style.top).toBe('230px');
		expect(ghost.style.transformOrigin).toBe('left top');
		expect(ghost.style.transform).toBe('translate(0px, 0px) scale(1, 1)');

		// Half-way, the ghost sits where the item would be inside the half-scaled
		// card (origin 0 + half the 100px slide + scaled local offset), and its
		// native size has shrunk with the card's scale.
		step.setProgress(0.5);
		expect(ghost.style.transform).toBe('translate(-80px, -82.5px) scale(0.75, 0.75)');

		// At the end the ghost settles inside the final card (local 120x130 / 2).
		step.setProgress(1);
		expect(ghost.style.transform).toBe('translate(-160px, -165px) scale(0.5, 0.5)');

		step.end();
		expect(ghosts('[data-layout="item"]').length).toBe(0);
	});

	it('rides a retained ancestor that only moves', () => {
		setBody(`
			<div data-layout="card" style="position:absolute;left:100px;top:100px;width:200px;height:200px">
				<div data-layout="item" style="position:absolute;left:120px;top:130px;width:40px;height:40px"></div>
			</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				// The card keeps its size but slides to the top-left corner.
				setBody(`
					<div data-layout="card" style="position:absolute;left:0px;top:0px;width:200px;height:200px"></div>
				`);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		const ghost = ghosts('[data-layout="item"]')[0];
		// A size-stable ancestor still contributes its translation to the ride.
		step.setProgress(0.5);
		expect(ghost.style.transform).toBe('translate(-50px, -50px) scale(1, 1)');

		step.end();
		expect(ghosts('[data-layout="item"]').length).toBe(0);
	});

	it('rides the entity the ancestor node belonged to before a key rewrite', () => {
		setBody(`
			<div data-layout="card" style="position:absolute;left:200px;top:50px;width:200px;height:200px">
				<div data-layout="item" style="position:absolute;left:220px;top:70px;width:40px;height:40px"></div>
			</div>
			<div data-layout="other" style="position:absolute;left:50px;top:50px;width:80px;height:60px"></div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				// Svelte reuses the old "card" detail node for the next hero
				// and the child node along with it: both have their
				// `data-layout` rewritten in place, while a fresh node claims
				// the old "card" key.
				const detail = element('[data-layout="card"]');
				element('[data-layout="item"]').dataset.layout = 'item2';
				detail.dataset.layout = 'other';
				const list = document.createElement('div');
				list.dataset.layout = 'card';
				list.style.cssText = 'position:absolute;left:50px;top:50px;width:80px;height:60px';
				document.body.appendChild(list);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		// The ghost rides the old "card" entity (large detail collapsing into
		// the small list row), not the node's current "other" key.
		const ghost = ghosts('[data-layout="item"]')[0];
		step.setProgress(0.5);
		expect(ghost.style.transform).toBe('translate(-141px, -24.5px) scale(0.7, 0.65)');

		step.end();
		expect(ghosts('[data-layout="item"]').length).toBe(0);
	});

	it('rides a retained ancestor that rotates its exiting content', () => {
		setBody(`
			<div data-layout="card" style="position:absolute;left:0px;top:0px;width:200px;height:200px;transform:rotate(0deg);transform-origin:0px 0px">
				<div data-layout="item" style="position:absolute;left:120px;top:130px;width:40px;height:40px"></div>
			</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				// The card turns 90° around its top-left corner while the item
				// is removed; the ghost must swing with the card's own
				// transform instead of freezing at its pre-change spot.
				setBody(`
					<div data-layout="card" style="position:absolute;left:0px;top:0px;width:200px;height:200px;transform:rotate(90deg);transform-origin:0px 0px"></div>
				`);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		const ghost = ghosts('[data-layout="item"]')[0];
		// The pivot-matched ride starts exactly where the rotating card placed
		// the item and rotates the ghost's offset as the card turns.
		expect(ghost.style.transform).toBe(
			'translate(-120px, -130px) translate(0px, 0px) rotate(0deg) scale(1, 1) translate(0px, 0px) scale(1, 1) translate(120px, 130px)'
		);
		step.setProgress(0.5);
		expect(ghost.style.transform).toBe(
			'translate(-120px, -130px) translate(0px, 0px) rotate(45deg) scale(1, 1) translate(0px, 0px) scale(1, 1) translate(120px, 130px)'
		);
		step.setProgress(1);
		expect(ghost.style.transform).toBe(
			'translate(-120px, -130px) translate(0px, 0px) rotate(90deg) scale(1, 1) translate(0px, 0px) scale(1, 1) translate(120px, 130px)'
		);

		step.end();
		expect(ghosts('[data-layout="item"]').length).toBe(0);
	});

	it("adds a retained ancestor's own translate to the ghost ride", () => {
		setBody(`
			<div data-layout="card" style="position:absolute;left:0px;top:0px;width:200px;height:200px;transform:translate(20px, 30px);transform-origin:0px 0px">
				<div data-layout="item" style="position:absolute;left:120px;top:130px;width:40px;height:40px"></div>
			</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				// The card keeps its own translate; only the item is removed.
				setBody(`
					<div data-layout="card" style="position:absolute;left:0px;top:0px;width:200px;height:200px;transform:translate(20px, 30px);transform-origin:0px 0px"></div>
				`);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		const ghost = ghosts('[data-layout="item"]')[0];
		// Pinned at the item's measured spot (already including the ancestor's
		// own translate), the ride adds that translate back so the ghost stays
		// glued to the card instead of jumping to the untransformed spot.
		expect(ghost.style.transform).toBe(
			'translate(-140px, -160px) translate(20px, 30px) rotate(0deg) scale(1, 1) translate(0px, 0px) scale(1, 1) translate(140px, 160px)'
		);
		step.setProgress(0.5);
		expect(ghost.style.transform).toBe(
			'translate(-140px, -160px) translate(20px, 30px) rotate(0deg) scale(1, 1) translate(0px, 0px) scale(1, 1) translate(140px, 160px)'
		);

		step.end();
		expect(ghosts('[data-layout="item"]').length).toBe(0);
	});

	it('keeps an exiting child native-sized under a scale:false retained ancestor', () => {
		setBody(`
			<div data-layout="card" style="position:absolute;left:100px;top:100px;width:100px;height:100px">
				<div data-layout="item" style="position:absolute;left:20px;top:30px;width:40px;height:40px"></div>
			</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				// The card slides up-left while growing through width/height
				// re-layout (`scale: false`); the item is removed.
				setBody(`
					<div data-layout="card" style="position:absolute;left:50px;top:50px;width:200px;height:200px"></div>
				`);
			},
			0.5,
			{ scale: false, ease: linear }
		);
		step.start();

		const ghost = ghosts('[data-layout="item"]')[0];
		// The ghost keeps its native size (scale 1) and rides the ancestor's
		// origin, staying at its local spot inside the re-laid-out card.
		expect(ghost.style.transform).toBe('translate(0px, 0px) scale(1, 1)');
		step.setProgress(0.5);
		expect(ghost.style.transform).toBe('translate(-25px, -25px) scale(1, 1)');
		step.setProgress(1);
		expect(ghost.style.transform).toBe('translate(-50px, -50px) scale(1, 1)');

		step.end();
		expect(ghosts('[data-layout="item"]').length).toBe(0);
	});

	it('slides in from below when enter is slide', () => {
		setBody('');
		const step = new LayoutStep(
			{},
			() => {
				setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
			},
			0.5,
			{ enter: 'slide' }
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.transform).toBe('translateY(100%)');
		expect(el.style.opacity).toBe('0');

		// The fade is delayed: still transparent through the first part of
		// the slide (eased progress 0.08 < the 0.4 fade start).
		step.setProgress(0.2);
		expect(parseFloat(el.style.opacity)).toBe(0);

		step.setProgress(0.5);
		expect(el.style.transform).toBe('translateY(50%)');
		expect(parseFloat(el.style.opacity)).toBeCloseTo(1 / 6);

		step.setProgress(1);
		step.end();
		expect(el.style.transform).toBe('');
		expect(el.style.opacity).toBe('');
	});

	it('composes enter opacity with a class opacity ceiling', () => {
		const styles = '<style>.dim { opacity: 0.5 }</style>';
		setBody(styles);
		const step = new LayoutStep(
			{},
			() => {
				setBody(`${styles}<div data-layout="a" class="dim" style="width:100px;height:50px"></div>`);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.opacity).toBe('0');
		step.setProgress(0.5);
		// The fade runs 0 → 0.5 (the class value), not 0 → 1, so clearing the
		// inline style at the end lands on the same 0.5 instead of popping.
		expect(parseFloat(el.style.opacity)).toBeCloseTo(0.25);
		step.setProgress(1);
		expect(parseFloat(el.style.opacity)).toBeCloseTo(0.5);
		step.end();
		expect(el.style.opacity).toBe('');
		expect(getComputedStyle(el).opacity).toBe('0.5');
	});

	it('starts an exiting ghost at its class opacity', () => {
		const styles = '<style>.dim { opacity: 0.5 }</style>';
		setBody(`${styles}<div data-layout="a" class="dim" style="width:100px;height:50px"></div>`);
		const step = new LayoutStep(
			{},
			() => {
				setBody(styles);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		// The ghost begins at the source's visual opacity (0.5), not full.
		const ghost = ghosts('[data-layout="a"]')[0];
		expect(parseFloat(ghost.style.opacity)).toBeCloseTo(0.5);
		step.setProgress(0.5);
		expect(parseFloat(ghost.style.opacity)).toBeCloseTo(0.25);

		step.end();
		expect(ghosts('[data-layout="a"]').length).toBe(0);
	});

	it('slides out downward when exit is slide', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				setBody('');
			},
			0.5,
			{ exit: 'slide', ease: linear }
		);
		step.start();

		const ghost = ghosts('[data-layout="a"]')[0];
		expect(ghost.style.transform).toBe('translateY(0%)');
		expect(ghost.style.opacity).toBe('1');

		// The slide and fade finish by `exitEnd` (default 1), so the ghost
		// is fully gone only at the step's end.
		step.setProgress(0.05);
		expect(ghost.style.transform).toBe('translateY(5%)');
		expect(parseFloat(ghost.style.opacity)).toBe(1);

		step.setProgress(0.1);
		expect(ghost.style.transform).toBe('translateY(10%)');
		expect(parseFloat(ghost.style.opacity)).toBe(1);

		step.setProgress(1);
		expect(ghost.style.transform).toBe('translateY(100%)');
		expect(parseFloat(ghost.style.opacity)).toBe(0);

		step.end();
		expect(ghosts('[data-layout="a"]').length).toBe(0);
	});

	it('completes the exit by a custom exitEnd and holds the finished state', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				setBody('');
			},
			0.5,
			{ exitEnd: 0.25, ease: linear }
		);
		step.start();

		const ghost = ghosts('[data-layout="a"]')[0];
		expect(ghost.style.opacity).toBe('1');

		step.setProgress(0.125);
		expect(parseFloat(ghost.style.opacity)).toBeCloseTo(0.5);

		step.setProgress(0.25);
		expect(ghost.style.opacity).toBe('0');

		step.setProgress(1);
		expect(ghost.style.opacity).toBe('0');

		step.end();
		expect(ghosts('[data-layout="a"]').length).toBe(0);
	});

	it('staggerers entering elements by the step fraction between them', () => {
		const step = new LayoutStep(
			{},
			() => {
				setBody(
					'<div data-layout="a" style="width:100px;height:40px"></div><div data-layout="b" style="width:100px;height:40px"></div>'
				);
			},
			1,
			{ enter: 'fade', stagger: 0.25, ease: linear }
		);
		step.start();

		const a = element('[data-layout="a"]');
		const b = element('[data-layout="b"]');
		expect(a.style.opacity).toBe('0');
		expect(b.style.opacity).toBe('0');

		step.setProgress(0.25);
		expect(parseFloat(a.style.opacity)).toBeCloseTo(0.25);
		// b's window starts at its stagger offset: not yet animating.
		expect(b.style.opacity).toBe('0');

		step.setProgress(0.5);
		expect(parseFloat(a.style.opacity)).toBeCloseTo(0.5);
		expect(parseFloat(b.style.opacity)).toBeCloseTo((0.5 - 0.25) / 0.75);

		step.setProgress(1);
		expect(a.style.opacity).toBe('1');
		expect(b.style.opacity).toBe('1');

		step.end();
		expect(a.style.opacity).toBe('');
		expect(b.style.opacity).toBe('');
	});

	it('staggerers only root entering elements so nested text follows its card', () => {
		const step = new LayoutStep(
			{},
			() => {
				setBody(
					'<div data-layout="card1"><span data-layout="card1-text">A</span></div><div data-layout="card2"><span data-layout="card2-text">B</span></div>'
				);
			},
			1,
			{ enter: 'fade', stagger: 0.6, ease: linear }
		);
		step.start();

		const card1 = element('[data-layout="card1"]');
		const card2 = element('[data-layout="card2"]');
		// card2 must be index 1 (delay 0.6), not index 2 (delay 1.2) which
		// would render it instantly; the nested spans consume no slots.
		expect(card1.style.opacity).toBe('0');
		expect(card2.style.opacity).toBe('0');

		step.setProgress(0.6);
		expect(parseFloat(card1.style.opacity)).toBeCloseTo(0.6);
		expect(card2.style.opacity).toBe('0');

		step.setProgress(0.8);
		expect(parseFloat(card2.style.opacity)).toBeCloseTo((0.8 - 0.6) / 0.4);

		step.setProgress(1);
		expect(card1.style.opacity).toBe('1');
		expect(card2.style.opacity).toBe('1');

		step.end();
		expect(card1.style.opacity).toBe('');
		expect(card2.style.opacity).toBe('');
	});

	it('staggerers exiting ghosts by the step fraction between them', () => {
		setBody(
			'<div data-layout="a" style="width:100px;height:40px"></div><div data-layout="b" style="width:100px;height:40px"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				setBody('');
			},
			1,
			{ exit: 'fade', exitEnd: 1, stagger: 0.25, ease: linear }
		);
		step.start();

		const a = ghosts('[data-layout="a"]')[0];
		const b = ghosts('[data-layout="b"]')[0];
		expect(a.style.opacity).toBe('1');
		expect(b.style.opacity).toBe('1');

		step.setProgress(0.25);
		// a (index 0) fades from 1; b (index 1) hasn't started leaving yet.
		expect(parseFloat(a.style.opacity)).toBeCloseTo(0.75);
		expect(b.style.opacity).toBe('1');

		step.setProgress(0.5);
		expect(parseFloat(a.style.opacity)).toBeCloseTo(0.5);
		expect(parseFloat(b.style.opacity)).toBeCloseTo(1 - (0.5 - 0.25) / 0.75);

		step.setProgress(1);
		expect(a.style.opacity).toBe('0');
		expect(b.style.opacity).toBe('0');

		step.end();
		expect(ghosts('[data-layout="a"]').length).toBe(0);
		expect(ghosts('[data-layout="b"]').length).toBe(0);
	});

	it('runs a custom enter function, passing the element, and applies transformOrigin', () => {
		let received: HTMLElement | null = null;
		const step = new LayoutStep(
			{},
			() => {
				setBody('<div data-layout="a" style="width:100px;height:40px"></div>');
			},
			1,
			{
				enter: (p, _direction, el) => {
					received = el;
					return {
						opacity: p,
						transform: `translateX(${(1 - p) * 100}%)`,
						transformOrigin: '0% 100%'
					};
				},
				ease: linear
			}
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(received).toBe(el);
		expect(parseFloat(el.style.opacity)).toBeCloseTo(0);
		expect(el.style.transform).toBe('translateX(100%)');
		expect(el.style.transformOrigin).toBe('0% 100%');

		step.setProgress(0.5);
		expect(parseFloat(el.style.opacity)).toBeCloseTo(0.5);
		expect(el.style.transform).toBe('translateX(50%)');

		step.setProgress(1);
		expect(el.style.opacity).toBe('1');
		expect(el.style.transform).toBe('translateX(0%)');

		step.end();
		expect(el.style.opacity).toBe('');
		expect(el.style.transform).toBe('');
	});

	it('runs a custom exit function on the ghost', () => {
		setBody('<div data-layout="a" style="width:100px;height:40px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				setBody('');
			},
			1,
			{
				exit: (p) => ({ opacity: 1 - p, transform: `translateX(${p * 100}px)` }),
				exitEnd: 1,
				ease: linear
			}
		);
		step.start();

		const ghost = ghosts('[data-layout="a"]')[0];
		expect(parseFloat(ghost.style.opacity)).toBeCloseTo(1);
		expect(ghost.style.transform).toBe('translateX(0px)');

		step.setProgress(0.5);
		expect(parseFloat(ghost.style.opacity)).toBeCloseTo(0.5);
		expect(ghost.style.transform).toBe('translateX(50px)');

		step.setProgress(1);
		expect(ghost.style.opacity).toBe('0');
		expect(ghost.style.transform).toBe('translateX(100px)');

		step.end();
		expect(ghosts('[data-layout="a"]').length).toBe(0);
	});

	it('completes the enter by a custom enterEnd and holds the finished state', () => {
		setBody('');
		const step = new LayoutStep(
			{},
			() => {
				setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
			},
			0.5,
			{ enter: 'fade', enterEnd: 0.25, ease: linear }
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.opacity).toBe('0');

		step.setProgress(0.25);
		expect(el.style.opacity).toBe('1');

		step.setProgress(1);
		expect(el.style.opacity).toBe('1');

		step.end();
		expect(el.style.opacity).toBe('');
	});

	it('revert restores state, clears styles and removes ghosts', () => {
		setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
		const state: Record<string, unknown> = { show: true };
		const step = new LayoutStep(
			state,
			() => {
				state.show = false;
				setBody('<div data-layout="b" style="width:20px;height:20px"></div>');
			},
			0.5
		);
		step.start();
		step.revert();

		expect(ghosts('[data-layout="a"]').length).toBe(0);
		const b = element('[data-layout="b"]');
		expect(b.style.opacity).toBe('');
		expect(state.show).toBe(true);
	});

	it('animates {#each} removals, insertions and survivors in one step', () => {
		resetItems();
		const app = mount(LayoutEach, { target: document.body });
		flushSync();

		const step = new LayoutStep(
			{},
			() => {
				removeTwo();
				addThree();
			},
			0.5
		);
		step.start();

		expect(ghosts('[data-layout="2"]').length).toBe(1);
		expect(ghosts('[data-layout="2"]')[0].style.opacity).toBe('1');

		const one = element('[data-layout="1"]');
		expect(one.style.position).toBe('absolute');
		expect(one.style.minWidth).toBe('auto');
		expect(one.style.transformOrigin).toBe('');

		const three = element('[data-layout="3"]');
		expect(three.style.opacity).toBe('0');

		step.setProgress(1);
		step.end();

		expect(ghosts('[data-layout="2"]').length).toBe(0);
		expect(one.style.transform).toBe('');
		expect(three.style.opacity).toBe('');

		unmount(app);
	});

	it('zeroes margins when pinning an entering element and restores them on end', () => {
		setBody('<style>.my { margin: 16px 0; }</style>');
		const step = new LayoutStep(
			{},
			() => {
				setBody(
					'<style>.my { margin: 16px 0; }</style><div data-layout="a" class="my" style="width:100px;height:10px"></div>'
				);
			},
			0.5
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.position).toBe('absolute');
		expect(el.style.margin).toBe('0px');
		expect(getComputedStyle(el).marginTop).toBe('0px');

		step.setProgress(0.5);
		expect(el.style.opacity).toBe('0.5');

		step.end();
		expect(el.style.margin).toBe('');
		expect(el.style.position).toBe('');
		expect(getComputedStyle(el).marginTop).toBe('16px');
	});

	it('positions a nested element relative to its moving data-layout ancestor', () => {
		setBody(`
			<div data-layout="box" style="position:absolute;left:100px;top:100px;width:400px;height:100px;display:flex;justify-content:flex-end">
				<div data-layout="child" style="width:50px;height:20px">child</div>
			</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				const box = element('[data-layout="box"]');
				box.style.left = '200px';
				box.style.width = '200px';
			},
			0.5
		);
		step.start();

		// The child is flex-end: 450 in the 400-wide box at 100 → local 350;
		// after the box moves to 200 and shrinks, it sits at 350 → local 150.
		// It is pinned at its final local spot and counter-transformed against
		// the box's own scale-and-translate so it still lands where it was.
		const child = element('[data-layout="child"]');
		expect(child.style.position).toBe('absolute');
		expect(child.style.left).toBe('150px');
		expect(child.style.transform).toBe('translate(25px, 0px) scale(0.5, 1)');
		expect(child.getBoundingClientRect().x).toBe(450);

		step.setProgress(1);
		expect(child.style.transform).toBe('translate(0px, 0px) scale(1, 1)');
		expect(child.style.left).toBe('150px');

		step.end();
		expect(child.style.left).toBe('');
		expect(child.style.position).toBe('');
	});

	it('pins children against a bordered container padding-box, not its border-box', () => {
		setBody(`
			<div data-layout="box" style="position:absolute;left:0;top:0;width:100px;height:60px;border-left:5px solid red;border-top:3px solid red;padding:8px">
				<div data-layout="child" style="width:40px;height:20px"></div>
			</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="box"]').style.width = '200px';
			},
			0.5
		);
		step.start();

		// The child's natural spot is border-box 0 + border 5/3 + padding 8;
		// `left`/`top` resolve from the padding-box edge, so the border counts
		// out and the pinned element lands on its natural spot once it settles.
		const child = element('[data-layout="child"]');
		expect(child.style.position).toBe('absolute');
		expect(parseFloat(child.style.left)).toBeCloseTo(8, 4);
		expect(parseFloat(child.style.top)).toBeCloseTo(8, 4);

		step.setProgress(1);
		expect(child.getBoundingClientRect().x).toBeCloseTo(13, 4);
		expect(child.getBoundingClientRect().y).toBeCloseTo(11, 4);

		step.end();
		expect(child.getBoundingClientRect().x).toBeCloseTo(13, 4);
		expect(child.getBoundingClientRect().y).toBeCloseTo(11, 4);
	});

	it('pins an entering element against a transformed containing block (no snap)', () => {
		// The scene container establishes a containing block via its transform
		// (the scene transition) and is offset from the viewport, so the pin
		// must resolve against its padding box — `offsetParent` misses it and
		// SVG reports undefined entirely. A viewport origin would shift the
		// pinned element by the container's offset, snapping back at the end.
		// Sizes come from classes (as in real scenes) so un-pinning on `end`
		// keeps the layout stable enough to compare.
		setBody(`
			<style>
				.code { width: 200px; height: 100px }
				.sv { width: 120px; height: 120px }
			</style>
			<div style="margin: 100px 0 0 120px">
				<div id="cb" style="transform: translate(0px, 0px) scale(1); padding: 16px; width: 400px; height: 200px; display: flex; align-items: center; gap: 24px;">
					<div data-layout="code" class="code"></div>
				</div>
			</div>
		`);
		const cb = element('#cb');
		const step = new LayoutStep(
			{},
			() => {
				const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
				svg.dataset.layout = 'scene';
				svg.setAttribute('viewBox', '0 0 100 100');
				svg.setAttribute('class', 'sv');
				cb.appendChild(svg);
			},
			0.5
		);
		step.start();

		const svg = element('[data-layout="scene"]');
		const code = element('[data-layout="code"]');
		const cs = getComputedStyle(cb);
		const padBoxLeft = cb.getBoundingClientRect().left + (parseFloat(cs.borderLeftWidth) || 0);
		const padBoxTop = cb.getBoundingClientRect().top + (parseFloat(cs.borderTopWidth) || 0);

		step.setProgress(1);
		// The SVG is the flex item after the 200px code plus the 24px gap, and
		// its pin resolves against the containing block's padding box.
		const pinned = { x: svg.getBoundingClientRect().x, y: svg.getBoundingClientRect().y };
		expect(pinned.x).toBeCloseTo(code.getBoundingClientRect().x + 224, 4);
		expect(parseFloat(svg.style.left)).toBeCloseTo(pinned.x - padBoxLeft, 4);
		expect(parseFloat(svg.style.top)).toBeCloseTo(pinned.y - padBoxTop, 4);

		// Un-pinning returns it to the exact same flex spot — no snap.
		step.end();
		expect(svg.getBoundingClientRect().x).toBeCloseTo(pinned.x, 4);
		expect(svg.getBoundingClientRect().y).toBeCloseTo(pinned.y, 4);
	});

	it('does not mistake an inline-size query container for a containing block', () => {
		// `container-type: inline-size` (Tailwind's `@container`) establishes no
		// containing block, so the pin must keep using the viewport origin —
		// treating it as a containing block would shift the element.
		setBody(`
			<style>
				.code { width: 200px; height: 100px }
				.sv { width: 120px; height: 120px }
			</style>
			<div style="margin: 60px 0 0 80px">
				<div id="cb" style="container-type: inline-size; padding: 16px; width: 400px; height: 200px; display: flex; align-items: center; gap: 24px;">
					<div data-layout="code" class="code"></div>
				</div>
			</div>
		`);
		const cb = element('#cb');
		const step = new LayoutStep(
			{},
			() => {
				const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
				svg.dataset.layout = 'scene';
				svg.setAttribute('viewBox', '0 0 100 100');
				svg.setAttribute('class', 'sv');
				cb.appendChild(svg);
			},
			0.5
		);
		step.start();

		const svg = element('[data-layout="scene"]');
		const code = element('[data-layout="code"]');

		step.setProgress(1);
		const pinned = { x: svg.getBoundingClientRect().x, y: svg.getBoundingClientRect().y };
		expect(pinned.x).toBeCloseTo(code.getBoundingClientRect().x + 224, 4);
		// A viewport origin: the pin equals the in-flow viewport position.
		expect(parseFloat(svg.style.left)).toBeCloseTo(pinned.x, 4);

		step.end();
		expect(svg.getBoundingClientRect().x).toBeCloseTo(pinned.x, 4);
		expect(svg.getBoundingClientRect().y).toBeCloseTo(pinned.y, 4);
	});

	it('counter-scales an em-based border-radius (computed to px)', () => {
		setBody(
			'<div data-layout="a" style="width:100px;height:100px;border-radius:2em;font-size:16px"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.width = '200px';
			},
			0.5,
			{ scale: true }
		);
		step.start();

		const el = element('[data-layout="a"]');
		// `2em` resolves to 32px in computed styles, so the px counter-scale
		// path applies and the corners stay put while the box shrinks to half.
		expect(el.style.borderRadius).toBe('64px / 32px');

		step.end();
		// The author's `2em` inline radius is restored, not wiped.
		expect(el.style.borderRadius).toBe('2em');
	});

	it('enterEnd: 0 renders the fully-entered state from the first frame', () => {
		setBody('');
		const step = new LayoutStep(
			{},
			() => {
				setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
			},
			0.5,
			{ enter: 'fade', enterEnd: 0 }
		);
		step.start();

		// A zero-length mapping domain would otherwise divide by zero into NaN
		// on the first frame; the transition is simply already complete.
		const el = element('[data-layout="a"]');
		expect(el.style.opacity).toBe('1');

		step.setProgress(0.5);
		expect(el.style.opacity).toBe('1');

		step.setProgress(1);
		step.end();
		expect(el.style.opacity).toBe('');
	});

	it('exitEnd: 0 renders the fully-exited state from the first frame', () => {
		setBody(
			'<div data-layout="a" style="width:100px;height:50px"></div><div data-layout="b" style="width:100px;height:50px"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
			},
			0.5,
			{ exit: 'fade', exitEnd: 0 }
		);
		step.start();

		const ghost = ghosts('[data-layout="b"]')[0];
		expect(ghost.style.opacity).toBe('0');
	});

	it('scale-enter without a scaling ancestor keeps the center transform origin', () => {
		setBody('');
		const step = new LayoutStep(
			{},
			() => {
				setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
			},
			0.5,
			{ enter: 'scale' }
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.transformOrigin).toBe('center center');
		expect(el.style.transform).toBe('scale(0)');
	});

	it('scale-enter inside a scaling ancestor anchors the origin to top-left', () => {
		setBody(`
			<div data-layout="box" style="width:100px;height:100px">
				<div data-layout="child" style="width:50px;height:50px"></div>
			</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="box"]').style.width = '200px';
				element('[data-layout="box"]').style.height = '200px';
				const box = element('[data-layout="box"]');
				const added = document.createElement('div');
				added.dataset.layout = 'new';
				added.style.width = '50px';
				added.style.height = '50px';
				box.appendChild(added);
			},
			0.5,
			{ enter: 'scale' }
		);
		step.start();

		// The counter transform's math assumes a top-left origin, which
		// silently overrides the scale-enter's center anchor.
		const added = element('[data-layout="new"]');
		expect(added.style.transformOrigin).toBe('left top');
		expect(added.style.transform).toContain('scale(0)');
		expect(added.style.transform).toContain('scale(2, 2)');
	});

	it('slide-enter inside a scaling ancestor composes the counter transform', () => {
		setBody(`
			<div data-layout="box" style="width:100px;height:100px">
				<div data-layout="child" style="width:50px;height:50px"></div>
			</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="box"]').style.width = '200px';
				element('[data-layout="box"]').style.height = '200px';
				const box = element('[data-layout="box"]');
				const added = document.createElement('div');
				added.dataset.layout = 'new';
				added.style.width = '50px';
				added.style.height = '50px';
				box.appendChild(added);
			},
			0.5,
			{ enter: 'slide' }
		);
		step.start();

		const added = element('[data-layout="new"]');
		expect(added.style.opacity).toBe('0');
		expect(added.style.transform).toContain('translateY(100%)');
		expect(added.style.transform).toContain('scale(2, 2)');
	});

	it('keeps an entering element at its final spot under a moving scaling ancestor', () => {
		setBody(`
			<div data-layout="box" style="position:absolute;left:0;top:0;width:100px;height:100px;padding-left:20px">
			</div>
		`);
		const step = new LayoutStep(
			{},
			() => {
				// The box glides from (0,0) to (200,0) while doubling in size;
				// the entering child must sit at its final local spot (inside
				// the final box at x=220), not be flung to the projected spot
				// by the box's motion.
				const box = element('[data-layout="box"]');
				box.style.left = '200px';
				box.style.width = '200px';
				box.style.height = '200px';
				const added = document.createElement('div');
				added.dataset.layout = 'new';
				added.style.width = '50px';
				added.style.height = '50px';
				box.appendChild(added);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		const added = element('[data-layout="new"]');
		// The child stays pinned to its final absolute spot the whole way
		// through (it has no previous position to glide from).
		expect(added.getBoundingClientRect().x).toBeCloseTo(220, 1);

		step.setProgress(0.5);
		expect(added.getBoundingClientRect().x).toBeCloseTo(220, 1);

		step.setProgress(1);
		expect(added.getBoundingClientRect().x).toBeCloseTo(220, 1);

		step.end();
		// `end()` restores the box's inline `left: 0`, so the child settles at
		// its natural spot (0 + padding 20); the during-step pinning is what
		// must hold it at the destination without shifting.
		expect(added.getBoundingClientRect().x).toBeCloseTo(20, 1);
	});

	it('keeps an existing transform while entering and restores it on end', () => {
		const step = new LayoutStep(
			{},
			() => {
				setBody(
					'<div data-layout="a" style="width:100px;height:40px;transform:rotate(30deg)"></div>'
				);
			},
			1,
			{ enter: 'slide', ease: linear }
		);
		step.start();

		const el = element('[data-layout="a"]');
		// The transition's slide composes BEFORE the element's own rotation, so
		// it slides in while staying tilted.
		expect(el.style.transform).toContain('translateY(100%)');
		expect(el.style.transform).toContain('matrix(');

		step.setProgress(0.5);
		expect(el.style.transform).toContain('translateY(50%)');
		expect(el.style.transform).toContain('matrix(');

		step.setProgress(1);
		expect(el.style.transform).toContain('matrix(');

		step.end();
		// The author's inline transform is restored, not wiped.
		expect(el.style.transform).toBe('rotate(30deg)');
	});

	it('keeps a stylesheet transform while entering and returns to it on end', () => {
		const step = new LayoutStep(
			{},
			() => {
				setBody(
					'<style>.tilted{transform:rotate(30deg)}</style><div data-layout="a" class="tilted" style="width:100px;height:40px"></div>'
				);
			},
			1,
			{ enter: 'slide', ease: linear }
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.transform).toContain('matrix(');

		step.end();
		// The inline transform is cleared so the class's transform re-applies.
		expect(el.style.transform).toBe('');
	});

	it('keeps an existing transform while FLIPping, pivoting around its center', () => {
		setBody(
			'<div data-layout="a" style="width:100px;height:50px;position:absolute;top:10px;left:10px;transform:rotate(30deg)"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				setBody(
					'<div data-layout="a" style="width:200px;height:80px;position:absolute;top:100px;left:100px;transform:rotate(30deg)"></div>'
				);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		const el = element('[data-layout="a"]');
		// The rotation is tweened (constant here) on top of the flip transform,
		// keeping the element's natural center pivot instead of forcing
		// top-left and wrapping the transform.
		expect(el.style.transformOrigin).toBe('');
		expect(el.style.transform).toBe('translate(-140px, -105px) scale(0.5, 0.625) rotate(30deg)');

		step.setProgress(1);
		expect(el.style.transform).toBe('translate(0px, 0px) scale(1, 1) rotate(30deg)');

		step.end();
		expect(el.style.transform).toBe('rotate(30deg)');
	});

	it('keeps a standalone rotate property with its natural pivot while FLIPping', () => {
		setBody(
			'<div data-layout="a" style="width:100px;height:50px;position:absolute;top:10px;left:10px;rotate:30deg"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				setBody(
					'<div data-layout="a" style="width:200px;height:80px;position:absolute;top:100px;left:100px;rotate:30deg"></div>'
				);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		const el = element('[data-layout="a"]');
		// The standalone rotate keeps its natural center pivot and is folded
		// into the tweened transform (the `rotate` property is suppressed to
		// identity so it can't double-apply).
		expect(el.style.transformOrigin).toBe('');
		expect(el.style.transform).toBe('translate(-140px, -105px) scale(0.5, 0.625) rotate(30deg)');
		expect(el.style.rotate).toBe('0deg');

		step.setProgress(1);
		expect(el.style.transform).toBe('translate(0px, 0px) scale(1, 1) rotate(30deg)');

		step.end();
		// The author's `rotate` property is restored, the tweened transform
		// cleared.
		expect(el.style.transform).toBe('');
		expect(el.style.rotate).toBe('30deg');
	});

	it('keeps an existing transform while exiting', () => {
		setBody('<div data-layout="a" style="width:100px;height:40px;transform:rotate(30deg)"></div>');
		const step = new LayoutStep(
			{},
			() => {
				setBody('');
			},
			1,
			{ exit: 'slide', exitEnd: 1, ease: linear }
		);
		step.start();

		const ghost = ghosts('[data-layout="a"]')[0];
		expect(ghost.style.transform).toContain('translateY(0%)');
		expect(ghost.style.transform).toContain('matrix(');

		step.setProgress(0.5);
		expect(ghost.style.transform).toContain('translateY(50%)');

		step.end();
		expect(ghosts('[data-layout="a"]').length).toBe(0);
	});

	it('supports standalone rotate/scale/translate in a custom transition', () => {
		const step = new LayoutStep(
			{},
			() => {
				setBody('<div data-layout="a" style="width:100px;height:40px"></div>');
			},
			1,
			{
				enter: (p) => ({
					rotate: `${(1 - p) * 90}deg`,
					scale: `${1 - p}`,
					translate: `${(1 - p) * 10}px ${(1 - p) * 20}px`
				}),
				ease: linear
			}
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.rotate).toBe('90deg');
		expect(el.style.scale).toBe('1');
		expect(el.style.translate).toBe('10px 20px');

		step.setProgress(0.5);
		expect(el.style.rotate).toBe('45deg');

		step.setProgress(1);
		expect(el.style.rotate).toBe('0deg');
		expect(el.style.translate).toBe('0px');

		step.end();
		expect(el.style.rotate).toBe('');
		expect(el.style.scale).toBe('');
		expect(el.style.translate).toBe('');
	});

	it('animates a retained element own rotation to zero (same box)', () => {
		setBody(
			'<div data-layout="a" style="width:100px;height:100px;position:absolute;top:100px;left:100px;rotate:45deg"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				setBody(
					'<div data-layout="a" style="width:100px;height:100px;position:absolute;top:100px;left:100px"></div>'
				);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		const el = element('[data-layout="a"]');
		// Identical layout boxes mean no flip compensation: only the rotation
		// tween runs, around the element's natural center. The final state has
		// no standalone `rotate`, so there is nothing to suppress.
		expect(el.style.transformOrigin).toBe('');
		expect(el.style.rotate).toBe('');
		expect(el.style.transform).toBe('rotate(45deg)');

		step.setProgress(0.5);
		expect(el.style.transform).toBe('rotate(22.5deg)');

		step.setProgress(1);
		expect(el.style.transform).toBe('');

		step.end();
		expect(el.style.transform).toBe('');
		expect(el.style.rotate).toBe('');
	});

	it('animates rotation while moving and resizing', () => {
		setBody(
			'<div data-layout="a" style="width:100px;height:50px;position:absolute;top:10px;left:10px;rotate:45deg"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				setBody(
					'<div data-layout="a" style="width:200px;height:80px;position:absolute;top:100px;left:100px"></div>'
				);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		const el = element('[data-layout="a"]');
		// The rotation tween composes outermost, on top of the flip
		// compensation, keeping the natural center pivot.
		expect(el.style.transformOrigin).toBe('');
		expect(el.style.transform).toBe('translate(-140px, -105px) scale(0.5, 0.625) rotate(45deg)');

		step.setProgress(0.5);
		expect(el.style.transform).toBe(
			'translate(-70px, -52.5px) scale(0.75, 0.8125) rotate(22.5deg)'
		);

		step.setProgress(1);
		expect(el.style.transform).toBe('translate(0px, 0px) scale(1, 1)');

		step.end();
		expect(el.style.transform).toBe('');
	});

	it('animates between two rotations of a retained element', () => {
		setBody(
			'<div data-layout="a" style="width:100px;height:100px;position:absolute;top:100px;left:100px;rotate:45deg"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				setBody(
					'<div data-layout="a" style="width:100px;height:100px;position:absolute;top:100px;left:100px;rotate:15deg"></div>'
				);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.transform).toBe('rotate(45deg)');

		step.setProgress(0.5);
		expect(el.style.transform).toBe('rotate(30deg)');

		// The final rotation is tweened back into the element while the
		// suppressed `rotate` property is still neutralized.
		step.setProgress(1);
		expect(el.style.transform).toBe('rotate(15deg)');
		expect(el.style.rotate).toBe('0deg');

		step.end();
		expect(el.style.transform).toBe('');
		expect(el.style.rotate).toBe('15deg');
	});

	it('tweens a stylesheet rotate while neutralizing it mid-step', () => {
		setBody(
			'<style>.rot{rotate:45deg}.rot15{rotate:15deg}</style><div data-layout="a" class="rot" style="width:100px;height:100px;position:absolute;top:100px;left:100px"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				setBody(
					'<style>.rot{rotate:45deg}.rot15{rotate:15deg}</style><div data-layout="a" class="rot15" style="width:100px;height:100px;position:absolute;top:100px;left:100px"></div>'
				);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		const el = element('[data-layout="a"]');
		// An inline `rotate: 0deg` neutralizes the class rule while the tween
		// supplies the rotation, so the class's 15deg can't double with it.
		expect(el.style.rotate).toBe('0deg');
		expect(el.style.transform).toBe('rotate(45deg)');

		step.setProgress(0.5);
		expect(el.style.transform).toBe('rotate(30deg)');

		step.setProgress(1);
		expect(el.style.transform).toBe('rotate(15deg)');

		step.end();
		// The inline override is cleared so the class's `rotate` re-applies.
		expect(el.style.rotate).toBe('');
		expect(el.style.transform).toBe('');
	});

	it('enters a transformed element without doubling its rotation', () => {
		const step = new LayoutStep(
			{},
			() => {
				setBody('<div data-layout="a" style="width:100px;height:40px;rotate:45deg"></div>');
			},
			1,
			{ enter: 'slide', ease: linear }
		);
		step.start();

		const el = element('[data-layout="a"]');
		// The enter transform slides the box while the standalone rotate keeps
		// it tilted — the individual property stays untouched during enter.
		expect(el.style.transform).toContain('translateY(100%)');
		expect(el.style.rotate).toBe('45deg');

		step.setProgress(0.5);
		expect(el.style.transform).toContain('translateY(50%)');
		expect(el.style.rotate).toBe('45deg');

		step.end();
		expect(el.style.transform).toBe('');
		expect(el.style.rotate).toBe('45deg');
	});

	it('keeps a translated transform anchored to its untranslated box', () => {
		setBody(
			'<div data-layout="a" style="width:100px;height:50px;position:absolute;top:10px;left:10px;transform:translate(20px, 30px)"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				setBody(
					'<div data-layout="a" style="width:100px;height:50px;position:absolute;top:10px;left:10px;transform:translate(20px, 30px)"></div>'
				);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		const el = element('[data-layout="a"]');
		// Pinned at the untranslated layout box, not the translated rect, so the
		// tweened transform lands on the same visual spot.
		expect(el.style.left).toBe('10px');
		expect(el.style.top).toBe('10px');
		expect(el.style.transform).toBe('translate(20px, 30px)');

		step.end();
		expect(el.style.transform).toBe('translate(20px, 30px)');
	});

	it('composes standalone scale before rotate like the CSS engine', () => {
		setBody(
			'<div data-layout="a" style="width:100px;height:50px;position:absolute;top:10px;left:10px;rotate:30deg;scale:2 1"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				setBody(
					'<div data-layout="a" style="width:100px;height:50px;position:absolute;top:10px;left:10px;rotate:30deg;scale:2 1"></div>'
				);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		const el = element('[data-layout="a"]');
		// The effective matrix is rotate(30deg) then scale(2, 1); folding them
		// in the CSS order roundtrips through the tween unchanged.
		expect(el.style.rotate).toBe('0deg');
		expect(el.style.scale).toBe('1');
		expect(el.style.transform).toBe('rotate(30deg) scale(2, 1)');

		step.end();
		expect(el.style.rotate).toBe('30deg');
		expect(el.style.scale).toBe('2 1');
	});

	it('roundtrips a reflected transform as rotate(180deg) scale(1, -1)', () => {
		setBody(
			'<div data-layout="a" style="width:100px;height:50px;position:absolute;top:10px;left:10px;transform:scaleX(-1)"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				setBody(
					'<div data-layout="a" style="width:100px;height:50px;position:absolute;top:10px;left:10px;transform:scaleX(-1)"></div>'
				);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		const el = element('[data-layout="a"]');
		// A reflection rides on the y scale so the roundtrip is still a
		// horizontal flip rather than a vertical one.
		expect(el.style.transform).toBe('rotate(180deg) scale(1, -1)');

		step.end();
		expect(el.style.transform).toBe('scaleX(-1)');
	});

	it('treats a single-value standalone scale as uniform', () => {
		setBody(
			'<div data-layout="a" style="width:100px;height:50px;position:absolute;top:10px;left:10px;scale:2"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				setBody(
					'<div data-layout="a" style="width:100px;height:50px;position:absolute;top:10px;left:10px;scale:2"></div>'
				);
			},
			0.5,
			{ ease: linear }
		);
		step.start();

		const el = element('[data-layout="a"]');
		// `scale: 2` means 2 2 — a missing y axis defaults to x.
		expect(el.style.transform).toBe('scale(2, 2)');

		step.end();
		expect(el.style.scale).toBe('2');
	});

	it('pins an exiting transformed element at its untranslated box', () => {
		setBody(
			'<div data-layout="a" style="width:100px;height:40px;position:absolute;top:10px;left:10px;transform:rotate(30deg)"></div>'
		);
		const step = new LayoutStep(
			{},
			() => {
				setBody('');
			},
			1,
			{ exit: 'fade', exitEnd: 1, ease: linear }
		);
		step.start();

		const ghost = ghosts('[data-layout="a"]')[0];
		// The ghost pins the untranslated layout box and re-applies the rotation
		// on top, so it renders at the source's visual footprint instead of an
		// inflated rotated rect.
		expect(ghost.style.left).toBe('10px');
		expect(ghost.style.top).toBe('10px');
		expect(ghost.style.width).toBe('100px');
		expect(ghost.style.height).toBe('40px');
		// The cloned inline rotation is preserved on the ghost.
		expect(ghost.style.transform).toContain('rotate');

		step.end();
		expect(ghosts('[data-layout="a"]').length).toBe(0);
	});
});
