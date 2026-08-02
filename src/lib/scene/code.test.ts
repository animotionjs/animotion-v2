import { describe, expect, it } from 'vitest';
import { resolveRangeArray, resolveSingleRange, smartIndent } from './code.svelte';

describe('range resolution', () => {
	const code = `function greet() {\n  console.log('Hi!');\n}`;

	it('resolves a plain string to the first occurrence', () => {
		expect(resolveSingleRange('greet', code)).toEqual([
			[0, 9],
			[0, 14]
		]);
		expect(resolveRangeArray('Hi!', code)).toEqual([
			[
				[1, 15],
				[1, 18]
			]
		]);
	});

	it('throws when the pattern is not found', () => {
		expect(() => resolveSingleRange('nope', code)).toThrow();
		expect(() => resolveRangeArray('nope', code)).toThrow();
	});
});

describe('smartIndent', () => {
	it('indents lines based on brace nesting', () => {
		const input = `function greet() {\nconsole.log('Hi!');\nreturn 7;\n}`;
		expect(smartIndent(input)).toBe(`function greet() {\n  console.log('Hi!');\n  return 7;\n}`);
	});

	it('dedents closing braces', () => {
		const input = `if (a) {\nb();\nc();\n}`;
		expect(smartIndent(input)).toBe(`if (a) {\n  b();\n  c();\n}`);
	});

	it('handles multiple nesting levels and closers on the same line', () => {
		const input = `function f() {\nconst o = {\na: 1,\nb: 2,\n};\n}`;
		expect(smartIndent(input)).toBe(`function f() {\n  const o = {\n    a: 1,\n    b: 2,\n  };\n}`);
	});

	it('collapses consecutive opening brackets on the same line', () => {
		const input = `const scene = createScene({\ncode: \`...\`,\nexample: false,\nradius: 200\n});\n\nscene\n.layout(() => scene.example = true, 0.6)\n.tween('radius', 200, 1.4);`;
		expect(smartIndent(input)).toBe(
			`const scene = createScene({\n  code: \`...\`,\n  example: false,\n  radius: 200\n});\n\nscene\n  .layout(() => scene.example = true, 0.6)\n  .tween('radius', 200, 1.4);`
		);
	});

	it('indents chained method calls as statement continuations', () => {
		const input = `const scene = createScene()\n.layout(() => { showCode = true }, 0.7)\n.tween('turn', 2, 3)`;
		expect(smartIndent(input)).toBe(
			`const scene = createScene()\n  .layout(() => { showCode = true }, 0.7)\n  .tween('turn', 2, 3)`
		);
	});

	it('indents chained method calls nested inside a block', () => {
		const input = `function setup() {\ncreateScene()\n.layout(() => {}, 0.5)\n}`;
		expect(smartIndent(input)).toBe(
			`function setup() {\n  createScene()\n    .layout(() => {}, 0.5)\n}`
		);
	});

	it('does not treat spread or numeric decimals as chain continuation', () => {
		const input = `const o = {\n  a: 1,\n  ...rest,\n  b: .5,\n};`;
		expect(smartIndent(input)).toBe(`const o = {\n  a: 1,\n  ...rest,\n  b: .5,\n};`);
	});

	it('indents with a custom unit', () => {
		const input = `function f() {\nx();\n}`;
		expect(smartIndent(input, '    ')).toBe(`function f() {\n    x();\n}`);
		expect(smartIndent(input, '\t')).toBe(`function f() {\n\tx();\n}`);
	});

	it('ignores braces inside strings and comments', () => {
		const input = `const s = '} { {\n// { { {\nconst t = "}";\n`;
		expect(smartIndent(input)).toBe(`const s = '} { {\n// { { {\nconst t = "}";`);
	});

	it('does not re-indent lines inside a multi-line comment', () => {
		const input = `/*\n  keep\n    this\nexact\n*/\n`;
		expect(smartIndent(input)).toBe(`/*\n  keep\n    this\nexact\n*/`);
	});

	it('does not re-indent lines inside a template literal', () => {
		const input = 'const s = `line1\n   indented content\n  `;\n';
		expect(smartIndent(input)).toBe('const s = `line1\n   indented content\n  `;');
	});

	it('replaces mixed tabs and spaces with the computed indent', () => {
		const input = `function greet() {\n\tconsole.log('Hi!');\n     \treturn 7;\n}`;
		expect(smartIndent(input)).toBe(`function greet() {\n  console.log('Hi!');\n  return 7;\n}`);
	});

	it('collapses whitespace-only lines', () => {
		const input = `function f() {\n   \n\n  x();\n}`;
		expect(smartIndent(input)).toBe(`function f() {\n\n\n  x();\n}`);
	});

	it('is idempotent', () => {
		const input = `function greet() {\nconsole.log('Hi!');\n}`;
		const once = smartIndent(input);
		expect(smartIndent(once)).toBe(once);
	});

	it('strips leading and trailing blank lines', () => {
		expect(smartIndent('\nfunction greet() {\n  x();\n}\n')).toBe(`function greet() {\n  x();\n}`);
		expect(smartIndent('\n\n  \n')).toBe('');
	});

	it('keeps blank input and no trailing newline intact', () => {
		expect(smartIndent('')).toBe('');
		expect(smartIndent('a')).toBe('a');
		expect(smartIndent('a\n')).toBe('a');
	});
});
