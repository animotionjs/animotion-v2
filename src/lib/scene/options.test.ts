import { beforeEach, describe, expect, it } from 'vitest';
import { getOptions, resolveRenderSize, setOptions } from './options';

beforeEach(() => {
	setOptions({ aspectRatio: 'video', render: {}, transition: null });
});

describe('options', () => {
	it('defaults to the video preset with fixed render defaults', () => {
		const options = getOptions();
		expect(options.aspectRatio).toEqual({ name: 'video', width: 1920, height: 1080 });
		expect(options.render).toMatchObject({
			fps: 60,
			width: 1920,
			height: 1080,
			jobs: 'auto',
			out: 'rendered/video.mp4',
			framesOnly: false,
			keepFrames: false,
			progressBar: false,
			gpu: true,
			format: 'png',
			jpegQuality: 95
		});
	});

	it('resolves each preset to its aspect ratio and resolution', () => {
		setOptions({ aspectRatio: 'vertical' });
		let options = getOptions();
		expect(options.aspectRatio).toEqual({ name: 'vertical', width: 1080, height: 1920 });
		expect(options.render).toMatchObject({ width: 1080, height: 1920 });

		setOptions({ aspectRatio: 'square' });
		options = getOptions();
		expect(options.aspectRatio).toEqual({ name: 'square', width: 1080, height: 1080 });
		expect(options.render).toMatchObject({ width: 1080, height: 1080 });
	});

	it('scales by the smaller side for each resolution tier', () => {
		setOptions({ aspectRatio: 'video', render: { resolution: '720p' } });
		expect(getOptions().render).toMatchObject({ width: 1280, height: 720 });

		setOptions({ aspectRatio: 'video', render: { resolution: '1080p' } });
		expect(getOptions().render).toMatchObject({ width: 1920, height: 1080 });

		setOptions({ aspectRatio: 'video', render: { resolution: '2k' } });
		expect(getOptions().render).toMatchObject({ width: 2560, height: 1440 });

		setOptions({ aspectRatio: 'video', render: { resolution: '4k' } });
		expect(getOptions().render).toMatchObject({ width: 3840, height: 2160 });

		setOptions({ aspectRatio: 'vertical', render: { resolution: '1080p' } });
		expect(getOptions().render).toMatchObject({ width: 1080, height: 1920 });

		setOptions({ aspectRatio: 'square', render: { resolution: '4k' } });
		expect(getOptions().render).toMatchObject({ width: 2160, height: 2160 });
	});

	it('prefers explicit width and height over the resolution tier', () => {
		setOptions({
			aspectRatio: 'video',
			render: { resolution: '4k', width: 1280, height: 720 }
		});
		expect(getOptions().render).toMatchObject({ width: 1280, height: 720 });
	});

	it('derives the missing dimension when only one is set', () => {
		setOptions({ aspectRatio: 'video', render: { width: 3840 } });
		expect(getOptions().render).toMatchObject({ width: 3840, height: 2160 });

		setOptions({ aspectRatio: 'vertical', render: { height: 1920 } });
		expect(getOptions().render).toMatchObject({ width: 1080, height: 1920 });
	});

	it('scales the smaller side of a preset via resolveRenderSize', () => {
		expect(resolveRenderSize('video', '720p')).toEqual({ width: 1280, height: 720 });
		expect(resolveRenderSize('square', '4k')).toEqual({ width: 2160, height: 2160 });
		expect(resolveRenderSize('vertical', '1080p')).toEqual({ width: 1080, height: 1920 });
	});

	it('exposes the tier in use, or null when dimensions take over', () => {
		setOptions({ aspectRatio: 'video', render: { resolution: '4k' } });
		expect(getOptions().render.resolution).toBe('4k');

		setOptions({ aspectRatio: 'video', render: {} });
		expect(getOptions().render.resolution).toBeNull();

		setOptions({ aspectRatio: 'video', render: { resolution: '4k', width: 1280, height: 720 } });
		expect(getOptions().render.resolution).toBeNull();
	});

	it('merges render overrides with defaults', () => {
		setOptions({ render: { fps: 30, jobs: 8 } });
		const options = getOptions();
		expect(options.render.fps).toBe(30);
		expect(options.render.jobs).toBe(8);
		expect(options.render.out).toBe('rendered/video.mp4');
	});

	it('resolves jpeg format and quality overrides', () => {
		setOptions({ render: { format: 'jpeg', jpegQuality: 90 } });
		const options = getOptions();
		expect(options.render.format).toBe('jpeg');
		expect(options.render.jpegQuality).toBe(90);
	});

	it('renders with gpu acceleration by default and allows opting out', () => {
		expect(getOptions().render.gpu).toBe(true);
		setOptions({ render: { gpu: false } });
		expect(getOptions().render.gpu).toBe(false);
	});

	it('defaults to no transition', () => {
		expect(getOptions().transition).toBeNull();
	});

	it('resolves a configured default transition', () => {
		setOptions({ transition: { type: 'slide', duration: 0.4 } });
		expect(getOptions().transition).toEqual({ type: 'slide', duration: 0.4 });
	});

	it('allows disabling the default transition', () => {
		setOptions({ transition: { type: 'fade' } });
		expect(getOptions().transition?.type).toBe('fade');
		setOptions({ transition: null });
		expect(getOptions().transition).toBeNull();
	});
});
