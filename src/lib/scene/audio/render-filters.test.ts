import { describe, expect, it } from 'vitest';
import { buildAudioFilters, buildMixFilter } from './render-filters.js';
import { createAudioTrack } from './tracks.js';

describe('buildAudioFilters', () => {
	it('builds a plain chain with delay and volume', () => {
		const { filters, mixInputs } = buildAudioFilters([createAudioTrack('a.mp3', { at: 2 })], 6);
		expect(filters).toHaveLength(1);
		expect(filters[0]).toContain('[1:a]');
		expect(filters[0]).toContain('adelay=2000:all=1');
		expect(filters[0]).toContain('volume=1');
		expect(filters[0]).not.toContain('atrim');
		expect(filters[0]).not.toContain('aloop');
		expect(filters[0]).not.toContain('afade');
		expect(mixInputs).toEqual(['[a0]']);
	});

	it('trims a slice with start and end', () => {
		const { filters } = buildAudioFilters(
			[createAudioTrack('a.mp3', { trimStart: 1, duration: 1.5 })],
			6
		);
		expect(filters[0]).toContain('atrim=start=1:end=2.5');
	});

	it('trims before looping so the loop repeats the kept region', () => {
		const { filters } = buildAudioFilters(
			[createAudioTrack('a.mp3', { trimStart: 1, loop: true })],
			6
		);
		const chain = filters[0]!;
		expect(chain.indexOf('atrim=start=1')).toBeGreaterThan(-1);
		expect(chain.indexOf('aloop')).toBeGreaterThan(chain.indexOf('atrim=start=1'));
	});

	it('fills a bounded loop to its duration', () => {
		const { filters } = buildAudioFilters(
			[createAudioTrack('a.mp3', { loop: true, duration: 2 })],
			6
		);
		const chain = filters[0]!;
		expect(chain).toContain('aloop=loop=-1:size=2e9');
		expect(chain).toContain('atrim=end=2');
		expect(chain.indexOf('atrim=end=2')).toBeGreaterThan(chain.indexOf('aloop'));
	});

	it('places fades at cue absolute times with an early landing margin', () => {
		const { filters } = buildAudioFilters(
			[createAudioTrack('a.mp3', { at: 1, duration: 2, fadeIn: 0.3, fadeOut: 0.4 })],
			6
		);
		expect(filters[0]).toContain('afade=t=in:st=1:d=0.3');
		expect(filters[0]).toContain('afade=t=out:st=2.5:d=0.4');
	});

	it('drops a fade at least as long as the cue', () => {
		const { filters } = buildAudioFilters(
			[createAudioTrack('a.mp3', { duration: 1, fadeOut: 1 })],
			6
		);
		expect(filters[0]).not.toContain('afade');
	});

	it('maps each track to its own input', () => {
		const { filters, mixInputs } = buildAudioFilters(
			[createAudioTrack('a.mp3'), createAudioTrack('b.mp3', { at: 1 })],
			6
		);
		expect(filters[0]).toContain('[1:a]');
		expect(filters[1]).toContain('[2:a]');
		expect(filters[1]).toContain('adelay=1000:all=1');
		expect(mixInputs).toEqual(['[a0]', '[a1]']);
	});

	it('mixes without renormalizing so the render matches the live player', () => {
		expect(buildMixFilter(['[a0]', '[a1]'])).toBe(
			'[a0][a1]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0'
		);
	});

	it('speeds the render tape style and trims source seconds', () => {
		const { filters } = buildAudioFilters([createAudioTrack('a.mp3', { duration: 2, rate: 2 })], 6);
		expect(filters[0]).toContain('atrim=start=0:end=4');
		expect(filters[0]).toContain('asetrate=r=96000');
		expect(filters[0]).toContain('aresample=48000');
		expect(filters[0]).not.toContain('atempo');
	});

	it('needs no chained filters for extreme rates', () => {
		const { filters } = buildAudioFilters([createAudioTrack('a.mp3', { rate: 4 })], 6);
		expect(filters[0]).toContain('asetrate=r=192000');
		expect(filters[0]).not.toContain('atempo');
	});

	it('slows the render and keeps the loop filled to its duration', () => {
		const { filters } = buildAudioFilters(
			[createAudioTrack('a.mp3', { loop: true, duration: 2, rate: 0.5 })],
			6
		);
		const chain = filters[0]!;
		expect(chain).toContain('aloop=loop=-1:size=2e9');
		expect(chain).toContain('asetrate=r=24000');
		expect(chain).toContain('atrim=end=2');
		expect(chain.indexOf('atrim=end=2')).toBeGreaterThan(chain.indexOf('asetrate=r=24000'));
	});
});
