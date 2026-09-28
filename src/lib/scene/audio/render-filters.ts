import { FADE_LANDING_MARGIN_SECONDS } from './fades.ts';
import type { AudioTrack } from './tracks.js';

export interface AudioFilterGraph {
	filters: string[];
	mixInputs: string[];
}

/**
 * One FFmpeg chain per track. Trim runs before loop so loops repeat the
 * kept part. Rate runs tape style to match the live player. Bounded
 * loops fill their duration like the live player does. The fade out
 * lands early so both go silent before the cut.
 */
export function buildAudioFilters(
	tracks: readonly AudioTrack[],
	sceneDuration: number
): AudioFilterGraph {
	const filters: string[] = [];
	const mixInputs: string[] = [];
	const baseIndex = 1;
	for (let i = 0; i < tracks.length; i++) {
		const track = tracks[i]!;
		const inputIndex = baseIndex + i;
		const playLength =
			track.duration !== null ? track.duration : Math.max(0, sceneDuration - track.at);
		const chain: string[] = [];
		if (!track.loop) {
			if (track.trimStart > 0 || track.duration !== null) {
				const endPart =
					track.duration !== null ? `:end=${track.trimStart + track.duration * track.rate}` : '';
				chain.push(`atrim=start=${track.trimStart}${endPart}`);
			}
		} else {
			if (track.trimStart > 0) chain.push(`atrim=start=${track.trimStart}`);
			chain.push(`aloop=loop=-1:size=2e9`);
		}
		chain.push(...tapeRateFilters(track.rate));
		if (track.loop && track.duration !== null) {
			chain.push(`atrim=end=${track.duration}`);
		}
		chain.push('asetpts=PTS-STARTPTS');
		chain.push(`adelay=${Math.round(track.at * 1000)}:all=1`);
		chain.push(`volume=${track.volume}`);
		if (
			playLength > 0 &&
			track.fadeIn > 0 &&
			track.fadeIn < playLength &&
			Number.isFinite(playLength)
		) {
			chain.push(`afade=t=in:st=${track.at}:d=${track.fadeIn}`);
		}
		if (
			playLength > 0 &&
			track.fadeOut > 0 &&
			track.fadeOut < playLength &&
			Number.isFinite(playLength)
		) {
			const margin = Math.min(FADE_LANDING_MARGIN_SECONDS, playLength / 2);
			const outStart = Math.max(0, track.at + playLength - margin - track.fadeOut);
			chain.push(`afade=t=out:st=${outStart}:d=${track.fadeOut}`);
		}
		chain.push('aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo');
		filters.push(`[${inputIndex}:a]${chain.join(',')}[a${i}]`);
		mixInputs.push(`[a${i}]`);
	}
	return { filters, mixInputs };
}

/**
 * The mix sums plainly to match the live player. Dropout stays zero so
 * one sound ending never changes the volume of the rest.
 */
export function buildMixFilter(mixInputs: readonly string[]): string {
	return `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=0:normalize=0`;
}

/**
 * Tape style speed. Faster means higher pitched like the live player.
 * Rates round to whole numbers.
 */
function tapeRateFilters(rate: number): string[] {
	if (!Number.isFinite(rate) || rate <= 0 || rate === 1) return [];
	return [`asetrate=r=${Math.round(48000 * rate)}`, 'aresample=48000'];
}
