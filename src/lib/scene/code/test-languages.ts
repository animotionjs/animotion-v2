import { configure } from './highlighter';

export function stubTokenizer(code: string) {
	const tokens: number[] = [];
	const types = ['keyword'];
	for (const match of code.matchAll(/\w+/g)) {
		tokens.push(0, match.index, match.index + match[0].length);
	}
	return { tokens: new Uint32Array(tokens), token_types: types };
}

export function registerTestLanguages() {
	configure({ languages: { typescript: () => stubTokenizer } });
}
