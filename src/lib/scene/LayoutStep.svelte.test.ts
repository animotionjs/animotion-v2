import { describe, expect, it, beforeEach } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { LayoutStep } from './steps';
import LayoutEach from './fixtures/LayoutEach.svelte';
import { addThree, removeTwo, resetItems } from './fixtures/items.svelte.js';

function setBody(html: string) {
	document.body.innerHTML = html;
}

function element(selector: string): HTMLElement {
	return document.querySelector(selector) as HTMLElement;
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
		expect(el.style.transform).toBe('translate(-90px, -90px) scale(1, 1)');

		step.setProgress(0.5);
		expect(el.style.transform).toBe('translate(-45px, -45px) scale(1, 1)');

		step.setProgress(1);
		step.end();
		expect(el.style.transform).toBe('');
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

	it('scales in when enter is scale', () => {
		setBody('');
		const step = new LayoutStep(
			{},
			() => {
				setBody('<div data-layout="a" style="width:100px;height:50px"></div>');
			},
			0.5,
			undefined,
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
			undefined,
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
			undefined,
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
			undefined,
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
			0.5
		);
		step.start();

		expect(ghosts('[data-layout="a"]').length).toBe(1);
		const ghost = ghosts('[data-layout="a"]')[0];
		expect(ghost.style.opacity).toBe('1');

		step.setProgress(0.5);
		expect(ghost.style.opacity).toBe('0.5');

		step.setProgress(1);
		expect(ghost.style.opacity).toBe('0');

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
			undefined,
			{ exit: 'scale' }
		);
		step.start();

		const ghost = ghosts('[data-layout="a"]')[0];
		expect(ghost.style.transform).toBe('scale(1)');

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
			undefined,
			{ exit: 'clip' }
		);
		step.start();

		const ghost = ghosts('[data-layout="a"]')[0];
		expect(ghost.style.clipPath).toBe('circle(100% at 50% 50%)');

		step.setProgress(0.5);
		expect(ghost.style.clipPath).toBe('circle(50% at 50% 50%)');

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
			undefined,
			{ exit: 'none' }
		);
		step.start();

		expect(ghosts('[data-layout="a"]').length).toBe(0);
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
		expect(one.style.transform).not.toBe('');
		expect(one.style.transformOrigin).not.toBe('');

		const three = element('[data-layout="3"]');
		expect(three.style.opacity).toBe('0');

		step.setProgress(1);
		step.end();

		expect(ghosts('[data-layout="2"]').length).toBe(0);
		expect(one.style.transform).toBe('');
		expect(three.style.opacity).toBe('');

		unmount(app);
	});
});
