import {
	configureHighlighter,
	diffStrings,
	hasLanguage,
	highlight,
	isHighlighterReady,
	onHighlighterReady,
	onHighlighterRefresh,
	whenReady,
	type HighlighterOptions,
	type LanguageFactory,
	type MorphToken,
	type PositionedToken,
	type Token,
	type Tokenizer
} from '../../code/highlighter.js';
import {
	setOptions,
	type AspectRatio,
	type RenderOptionsInput,
	type TransitionConfig
} from '../options.js';

export {
	diffStrings,
	hasLanguage,
	highlight,
	isHighlighterReady,
	onHighlighterReady,
	onHighlighterRefresh,
	whenReady,
	type LanguageFactory,
	type MorphToken,
	type PositionedToken,
	type Token,
	type Tokenizer
};

/** Presentation-wide highlighter and render settings. */
export interface ConfigureOptions extends HighlighterOptions {
	aspectRatio?: AspectRatio;
	render?: RenderOptionsInput;
	transition?: TransitionConfig | null;
}

export function configure(options: ConfigureOptions) {
	configureHighlighter(options);
	if (options.aspectRatio || options.render || options.transition !== undefined) {
		setOptions({
			aspectRatio: options.aspectRatio,
			render: options.render,
			transition: options.transition
		});
	}
}
