import {
	isSceneTransition,
	type SceneTransition,
	type SceneTransitionConfig
} from './transitions.js';

export interface SceneMarkdown {
	body: string;
	transition?: SceneTransitionConfig;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Reads the optional transition block at the top of a Markdown scene. The
 * block is plain `key: value` lines so the presentation does not need a YAML parser.
 */
export function parseSceneMarkdown(source: string): SceneMarkdown {
	const match = FRONTMATTER.exec(source);
	if (!match) return { body: source };

	const values = new Map<string, string>();
	for (const line of (match[1] ?? '').split(/\r?\n/)) {
		const at = line.indexOf(':');
		if (at <= 0) continue;
		values.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
	}

	return {
		body: source.slice(match[0].length),
		transition: readTransition(values)
	};
}

function readTransition(values: Map<string, string>): SceneTransitionConfig | undefined {
	const enter = readPreset(values.get('enter'));
	const exit = readPreset(values.get('exit'));
	const durationText = values.get('duration');
	const duration = durationText === undefined ? undefined : Number(durationText);

	if (duration !== undefined && !Number.isFinite(duration)) {
		throw new Error(`Scene transition duration must be a number, got "${durationText}"`);
	}

	if (enter === undefined && exit === undefined && duration === undefined) return undefined;
	return { enter, exit, duration };
}

function readPreset(value: string | undefined): SceneTransition | undefined {
	if (value === undefined) return undefined;
	if (!isSceneTransition(value)) {
		throw new Error(`Unknown scene transition "${value}". Use slide, fade, zoom, or none.`);
	}
	return value;
}

export type Inline =
	| { type: 'text'; text: string }
	| { type: 'strong'; text: string }
	| { type: 'em'; text: string }
	| { type: 'code'; text: string }
	| { type: 'link'; text: string; href: string };

export interface MarkdownCodeStep {
	code: string;
	highlight?: string;
}

interface BlockMeta {
	/** Stable key used to animate this block between replace steps. */
	layout?: string;
}

export type Block =
	| ({ type: 'heading'; level: number; text: string } & BlockMeta)
	| ({ type: 'paragraph'; text: string } & BlockMeta)
	| ({ type: 'list'; ordered: boolean; items: string[] } & BlockMeta)
	| ({
			type: 'code';
			language: string;
			code: string;
			/** Extra states for a fence marked with `steps`. */
			steps?: MarkdownCodeStep[];
	  } & BlockMeta)
	| ({ type: 'quote'; text: string } & BlockMeta)
	| ({ type: 'rule' } & BlockMeta);

export interface MarkdownStep {
	blocks: Block[];
	/** A replace step hides the previous content instead of adding to it. */
	replace: boolean;
}

/**
 * Splits Markdown into step chunks. The first chunk is the base slide,
 * `+++` starts an appending step, and `===` starts a replacing step. Lines
 * inside fenced code are ignored.
 */
export function parseMarkdown(source: string): MarkdownStep[] {
	return splitSteps(source).map((chunk) => ({
		blocks: parseBlocks(chunk.source),
		replace: chunk.replace
	}));
}

function splitSteps(source: string): { source: string; replace: boolean }[] {
	const chunks: { lines: string[]; replace: boolean }[] = [{ lines: [], replace: false }];
	let fence = false;

	for (const line of source.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.startsWith('```')) fence = !fence;
		if (!fence && (trimmed === '+++' || trimmed === '===')) {
			chunks.push({ lines: [], replace: trimmed === '===' });
			continue;
		}
		chunks[chunks.length - 1].lines.push(line);
	}

	return chunks.map((chunk) => ({
		source: chunk.lines.join('\n').trim(),
		replace: chunk.replace
	}));
}

/**
 * Splits a `steps` fence into code states. A `+++` line starts the next state,
 * and anything after it is the highlight for that state.
 */
function splitCodeStates(source: string): MarkdownCodeStep[] {
	const states: MarkdownCodeStep[] = [];
	let code: string[] = [];
	let highlight: string | undefined;

	for (const line of source.split('\n')) {
		const separator = line.match(/^\s*\+\+\+\s*(.*)$/);
		if (!separator) {
			code.push(line);
			continue;
		}

		states.push({ code: code.join('\n'), highlight });
		code = [];
		highlight = separator[1]?.trim() || undefined;
	}

	states.push({ code: code.join('\n'), highlight });
	return states;
}

function parseBlocks(source: string): Block[] {
	const lines = source.split('\n');
	const blocks: Block[] = [];
	let pendingLayout: string | undefined;
	let index = 0;

	function add(block: Block) {
		if (pendingLayout !== undefined) block.layout = pendingLayout;
		pendingLayout = undefined;
		blocks.push(block);
	}

	while (index < lines.length) {
		const line = lines[index];
		const trimmed = line.trim();
		if (trimmed === '') {
			index++;
			continue;
		}

		const layout = trimmed.match(/^<!--\s*layout:\s*([\w-]+)\s*-->$/);
		if (layout) {
			pendingLayout = layout[1];
			index++;
			continue;
		}

		if (trimmed.startsWith('```')) {
			const info = trimmed.slice(3).trim();
			const parts = info.length > 0 ? info.split(/\s+/) : [];
			const language = parts[0] || 'text';
			const code: string[] = [];
			index++;
			while (index < lines.length && !lines[index].trim().startsWith('```')) {
				code.push(lines[index]);
				index++;
			}
			index++;

			const source = code.join('\n');
			if (parts.includes('steps')) {
				const states = splitCodeStates(source);
				add({
					type: 'code',
					language,
					code: states[0]?.code ?? '',
					steps: states.slice(1)
				});
				continue;
			}

			add({ type: 'code', language, code: source });
			continue;
		}

		const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
		if (heading) {
			add({
				type: 'heading',
				level: (heading[1] ?? '#').length,
				text: heading[2] ?? ''
			});
			index++;
			continue;
		}

		if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
			add({ type: 'rule' });
			index++;
			continue;
		}

		if (trimmed.startsWith('>')) {
			const quote: string[] = [];
			while (index < lines.length && lines[index].trim().startsWith('>')) {
				quote.push(lines[index].trim().replace(/^>\s?/, ''));
				index++;
			}
			add({ type: 'quote', text: quote.join(' ') });
			continue;
		}

		const listItem = trimmed.match(/^([-*+]|\d+\.)\s+(.*)$/);
		if (listItem) {
			const ordered = /\d/.test(listItem[1] ?? '');
			const items: string[] = [];
			while (index < lines.length) {
				const item = lines[index].trim().match(/^([-*+]|\d+\.)\s+(.*)$/);
				if (!item) break;
				items.push(item[2] ?? '');
				index++;
			}
			add({ type: 'list', ordered, items });
			continue;
		}

		const paragraph: string[] = [];
		while (index < lines.length) {
			const next = lines[index].trim();
			if (
				next === '' ||
				next.startsWith('#') ||
				next.startsWith('```') ||
				next.startsWith('>') ||
				next.startsWith('<!--') ||
				/^(-{3,}|\*{3,}|_{3,})$/.test(next) ||
				/^([-*+]|\d+\.)\s+/.test(next)
			) {
				break;
			}
			paragraph.push(next);
			index++;
		}
		if (paragraph.length > 0) add({ type: 'paragraph', text: paragraph.join(' ') });
	}

	return blocks;
}

const INLINE_PATTERN = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;

export function parseInline(source: string): Inline[] {
	const parts: Inline[] = [];
	let last = 0;

	for (const match of source.matchAll(INLINE_PATTERN)) {
		const at = match.index ?? 0;
		if (at > last) parts.push({ type: 'text', text: source.slice(last, at) });

		const token = match[0];
		if (token.startsWith('`')) {
			parts.push({ type: 'code', text: token.slice(1, -1) });
		} else if (token.startsWith('**')) {
			parts.push({ type: 'strong', text: token.slice(2, -2) });
		} else if (token.startsWith('*')) {
			parts.push({ type: 'em', text: token.slice(1, -1) });
		} else {
			const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
			parts.push({ type: 'link', text: link?.[1] ?? token, href: link?.[2] ?? '#' });
		}

		last = at + token.length;
	}

	if (last < source.length) parts.push({ type: 'text', text: source.slice(last) });
	return parts;
}
