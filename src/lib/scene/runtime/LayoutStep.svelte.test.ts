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
			0.5
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

		// Pinned at the final (centered) bounds, with the transform translating
		// back to the previous (also centered) bounds, so the first frame lands
		// where the element was rather than being pushed further.
		const el = element('[data-layout="a"]');
		const rect = el.getBoundingClientRect();
		expect(rect.x).toBe(150);
		expect(rect.y).toBe(125);
		expect(el.style.position).toBe('absolute');
		expect(el.style.left).toBe('100px');
		expect(el.style.top).toBe('100px');
		expect(el.style.transform).toBe('translate(50px, 25px)');

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
			0.5
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

	it('counter-scales direct text against an anisotropic scaling box (scale: true)', () => {
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

		// Text is never scaled (that would distort its glyphs); instead it is
		// pinned at its final bounds and counter-scaled against the box's
		// anisotropic morph so its rendered size stays constant.
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

	it('keeps direct text unscaled while its box morphs', () => {
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
			0.5
		);
		step.start();

		// Text is never scaled or re-laid-out: it is pinned at its final bounds
		// and doesn't move here, so its glyphs rasterize at native size.
		const title = element('[data-layout="title"]');
		expect(ghosts('[data-layout="title"]').length).toBe(0);
		expect(title.style.visibility).toBe('');
		expect(title.style.width).toBe('200px');
		expect(title.style.transform).toBe('');

		step.setProgress(0.5);
		step.setProgress(1);
		expect(title.style.transform).toBe('');

		step.end();
		expect(title.style.transform).toBe('');
		expect(title.style.width).toBe('');
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
			0.5
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
		expect(el.style.borderRadius).toBe('');
	});

	it('keeps a constant border-radius while the box grows', () => {
		setBody('<div data-layout="a" style="width:100px;height:100px;border-radius:16px"></div>');
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.width = '200px';
			},
			0.5
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
		expect(el.style.borderRadius).toBe('');
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
		expect(el.style.borderRadius).toBe('');
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
		expect(el.style.borderRadius).toBe('');
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
		expect(el.style.borderRadius).toBe('');
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
		expect(el.style.backgroundColor).toBe('');
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
		expect(el.style.backgroundColor).toBe('');
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
		expect(el.style.backgroundColor).toBe('');
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
		expect(el.style.backgroundColor).toBe('');
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
		expect(el.style.borderColor).toBe('');
	});

	it('morphs font-size when it changes', () => {
		setBody('<div data-layout="a" style="font-size:16px">text</div>');
		const step = new LayoutStep(
			{},
			() => {
				element('[data-layout="a"]').style.fontSize = '32px';
			},
			0.5
		);
		step.start();

		const el = element('[data-layout="a"]');
		expect(el.style.fontSize).toBe('16px');

		step.setProgress(0.5);
		expect(el.style.fontSize).toBe('24px');

		step.setProgress(1);
		step.end();
		expect(el.style.fontSize).toBe('');
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

		// The exit completes by `exitEnd` (default 0.1): at the step's 5%
		// mark the ghost is half-faded, and gone by the 10% mark.
		step.setProgress(0.05);
		expect(ghost.style.opacity).toBe('0.5');

		step.setProgress(0.1);
		expect(ghost.style.opacity).toBe('0');

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

		// The exit completes by `exitEnd` (default 0.1), so it is fully
		// scaled away by the step's 10% mark.
		step.setProgress(0.1);
		expect(ghost.style.transform).toBe('scale(0)');

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

		// Fully clipped away by the step's 10% mark (`exitEnd` default 0.1).
		step.setProgress(0.1);
		expect(ghost.style.clipPath).toBe('circle(0% at 50% 50%)');

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

		// Stays mostly opaque while it starts leaving; the slide and fade
		// finish by `exitEnd` (default 0.1), so it is gone by the 10% mark.
		step.setProgress(0.05);
		expect(ghost.style.transform).toBe('translateY(50%)');
		expect(parseFloat(ghost.style.opacity)).toBeCloseTo(5 / 6);

		step.setProgress(0.1);
		expect(ghost.style.transform).toBe('translateY(100%)');
		expect(parseFloat(ghost.style.opacity)).toBe(0);

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
		// It is pinned at its final local spot and translated back (the box's
		// own translate rides along) so it still lands where it was.
		const child = element('[data-layout="child"]');
		expect(child.style.position).toBe('absolute');
		expect(child.style.left).toBe('150px');
		expect(child.style.transform).toBe('translate(200px, 0px)');

		step.setProgress(1);
		expect(child.style.transform).toBe('translate(0px, 0px)');
		expect(child.style.left).toBe('150px');

		step.end();
		expect(child.style.left).toBe('');
		expect(child.style.position).toBe('');
	});
});
