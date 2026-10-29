import { describe, expect, it } from 'vitest';
import {
	resolveSceneTransition,
	sceneKeyframes,
	type SceneTransitionConfig
} from './transitions.js';

describe('scene transitions', () => {
	it('uses the presentation default when a scene has no config', () => {
		expect(resolveSceneTransition(undefined, 'fade', 500)).toEqual({
			enter: 'fade',
			exit: 'fade',
			duration: 500
		});
	});

	it('uses one name for both sides', () => {
		expect(resolveSceneTransition('zoom', 'slide', 450)).toEqual({
			enter: 'zoom',
			exit: 'zoom',
			duration: 450
		});
	});

	it('lets a scene override each side', () => {
		const config: SceneTransitionConfig = { enter: 'slide', exit: 'none', duration: 700 };
		expect(resolveSceneTransition(config, 'fade', 450)).toEqual({
			enter: 'slide',
			exit: 'none',
			duration: 700
		});
	});

	it('falls back per side when only one is set', () => {
		expect(resolveSceneTransition({ enter: 'zoom' }, 'slide', 450)).toEqual({
			enter: 'zoom',
			exit: 'slide',
			duration: 450
		});
	});

	it('slides in from the right and out to the left when moving forward', () => {
		const enter = sceneKeyframes('slide', 'enter', 'forward');
		const exit = sceneKeyframes('slide', 'exit', 'forward');

		expect(enter?.[0]).toMatchObject({ transform: 'translateX(100%)' });
		expect(exit?.[1]).toMatchObject({ transform: 'translateX(-100%)' });
	});

	it('reverses the slide direction when moving backward', () => {
		const enter = sceneKeyframes('slide', 'enter', 'backward');
		const exit = sceneKeyframes('slide', 'exit', 'backward');

		expect(enter?.[0]).toMatchObject({ transform: 'translateX(-100%)' });
		expect(exit?.[1]).toMatchObject({ transform: 'translateX(100%)' });
	});

	it('returns no keyframes for none', () => {
		expect(sceneKeyframes('none', 'enter', 'forward')).toBeNull();
		expect(sceneKeyframes('none', 'exit', 'forward')).toBeNull();
	});
});
