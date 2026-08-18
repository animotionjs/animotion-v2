import { describe, expect, it } from 'vitest';
import {
	ALL,
	FIRST,
	LAST,
	lines,
	position,
	range,
	resolveRangeArray,
	resolveSingleRange,
	smartIndent,
	word
} from './code.svelte';

describe('range helpers', () => {
	it('interprets line numbers as 1-indexed', () => {
		expect(lines(1, 2)).toEqual([
			[
				[0, 0],
				[1, Infinity]
			]
		]);
		expect(lines(1)).toEqual([
			[
				[0, 0],
				[0, Infinity]
			]
		]);
		expect(word(2, 15)).toEqual([
			[1, 15],
			[1, Infinity]
		]);
		expect(word(1, 5, 3)).toEqual([
			[0, 5],
			[0, 8]
		]);
		expect(position(3, 0)).toEqual([
			[2, 0],
			[2, 0]
		]);
		expect(range(1, 0, 2, 4)).toEqual([
			[0, 0],
			[1, 4]
		]);
	});

	it('throws with a helpful message on 0 or negative lines', () => {
		expect(() => lines(0)).toThrow(/Lines are 1-indexed/);
		expect(() => lines(1, 0)).toThrow(/Lines are 1-indexed/);
		expect(() => word(0, 1)).toThrow(/Lines are 1-indexed/);
		expect(() => position(-1, 0)).toThrow(/Lines are 1-indexed/);
		expect(() => range(1, 0, 0, 0)).toThrow(/Lines are 1-indexed/);
	});
});

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

	it('matches every occurrence with a RegExp lacking the /g flag', () => {
		const sample = 'let count = 0;\nlet double = count * 2;';
		expect(ALL(/count/)(sample)).toEqual([
			[
				[0, 4],
				[0, 9]
			],
			[
				[1, 13],
				[1, 18]
			]
		]);
	});

	it('resolves LAST and FIRST with a RegExp lacking the /g flag', () => {
		const sample = 'let count = 0;\nlet double = count * 2;';
		expect(LAST(/count/)(sample)).toEqual([
			[1, 13],
			[1, 18]
		]);
		expect(FIRST(/count/)(sample)).toEqual([
			[0, 4],
			[0, 9]
		]);
	});

	it('preserves other RegExp flags', () => {
		expect(ALL(/COUNT/i)('let Count = 1;\nlet c = Count;')).toEqual([
			[
				[0, 4],
				[0, 9]
			],
			[
				[1, 8],
				[1, 13]
			]
		]);
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

	it('keeps a call inline object argument at one level', () => {
		const input = `const scene = createScene({\ncode: \`...\`,\nexample: false,\nradius: 200\n});\n\nscene\n.layout(() => scene.example = true, 0.6)\n.tween('radius', 200, 1.4);`;
		expect(smartIndent(input)).toBe(
			`const scene = createScene({\n  code: \`...\`,\n  example: false,\n  radius: 200\n});\n\nscene\n  .layout(() => scene.example = true, 0.6)\n  .tween('radius', 200, 1.4);`
		);
	});

	it('nests a callback block one level beyond its chained call', () => {
		const input = `const scene = createScene({	code: \`...\`, view: 'code', radius: 200 })\n.layout(() => scene.view = 'example', 0.6)\n.tween('radius', 200, 1.4)\n.all((s) => {\ns.codeSelection(code.lines(8), 0.4);\ns.tween('radius', 300, 1.4);\n});`;
		expect(smartIndent(input)).toBe(
			`const scene = createScene({	code: \`...\`, view: 'code', radius: 200 })\n  .layout(() => scene.view = 'example', 0.6)\n  .tween('radius', 200, 1.4)\n  .all((s) => {\n    s.codeSelection(code.lines(8), 0.4);\n    s.tween('radius', 300, 1.4);\n  });`
		);
	});

	it('continues a chain at the statement level after a block closes', () => {
		const input = `scene\n.all((s) => {\ns.tween('x', 1);\n})\n.then(() => {});`;
		expect(smartIndent(input)).toBe(
			`scene\n  .all((s) => {\n    s.tween('x', 1);\n  })\n  .then(() => {});`
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

	it('indents a standalone assignment continuation one level deeper', () => {
		const input = `function f() {
state.value
= lerp(from, to, progress);
}`;
		expect(smartIndent(input)).toBe(`function f() {
  state.value
    = lerp(from, to, progress);
}`);
	});

	it('indents a top-level assignment continuation one level deeper', () => {
		expect(smartIndent('value\n= lerp(from, to, progress);')).toBe(
			`value\n  = lerp(from, to, progress);`
		);
	});

	it('does not treat a leading = after a completed statement as a continuation', () => {
		const input = `const a = 1;\n= foo();`;
		expect(smartIndent(input)).toBe(`const a = 1;\n= foo();`);
	});

	it('keeps = continuations idempotent', () => {
		const input = `function f() {
  state.value
    = lerp(from, to, progress);
}`;
		expect(smartIndent(input)).toBe(input);
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

	it('indents content inside HTML tags', () => {
		const input = `<script>
let count = $state(0);

function increment() {
count += 1;
}
</script>

<button onclick={increment}>
count is {count}
</button>`;
		expect(smartIndent(input)).toBe(`<script>
  let count = $state(0);

  function increment() {
    count += 1;
  }
</script>

<button onclick={increment}>
  count is {count}
</button>`);
	});

	it('keeps void and self-closing tags from opening a block', () => {
		const input = `<img src="x" />\n<p>\nHello\n</p>\n<br>\n<div>\nText\n</div>`;
		expect(smartIndent(input)).toBe(
			`<img src="x" />\n<p>\n  Hello\n</p>\n<br>\n<div>\n  Text\n</div>`
		);
	});

	it('does not treat generic or comparison angle brackets as tags', () => {
		const input = `const list = new Set<string>();\nif (a < b && c > d) {\nx();\n}`;
		expect(smartIndent(input)).toBe(
			`const list = new Set<string>();\nif (a < b && c > d) {\n  x();\n}`
		);
	});

	it('balances inline tags on a single line', () => {
		const input = `<div class="a"><span>Hi</span></div>\n<p>\nText\n</p>`;
		expect(smartIndent(input)).toBe(`<div class="a"><span>Hi</span></div>\n<p>\n  Text\n</p>`);
	});

	it('is idempotent with HTML content', () => {
		const input = `<div>\n<p>\nText\n</p>\n</div>`;
		const once = smartIndent(input);
		expect(smartIndent(once)).toBe(once);
	});

	it('indents attributes of a multiline tag and aligns the closing slash', () => {
		const input = `<div\nclass="h-20 w-20 rounded-full bg-amber-400"\nstyle:translate="{scene.x}px"\n/>`;
		expect(smartIndent(input)).toBe(
			`<div\n  class="h-20 w-20 rounded-full bg-amber-400"\n  style:translate="{scene.x}px"\n/>`
		);
	});

	it('opens a block once a multiline tag closes with >', () => {
		const input = `<div\nclass="foo">\nText\n</div>`;
		expect(smartIndent(input)).toBe(`<div\n  class="foo">\n  Text\n</div>`);
	});

	it('ignores angle brackets inside expression attributes of a multiline tag', () => {
		const input = `<button\nonclick={count > 3}\n>\nIncrement\n</button>`;
		expect(smartIndent(input)).toBe(
			`<button\n  onclick={count > 3}\n>\n  Increment\n</button>`
		);
	});

	it('is idempotent with multiline tags', () => {
		const input = `<div\nclass="x"\n/>\n<p>\nHi\n</p>`;
		const once = smartIndent(input);
		expect(smartIndent(once)).toBe(once);
	});

	it('re-indents a demo scene mixing script, chain and multiline tag', () => {
		const input = `
		<script>
			import { createScene } from '#lib/scene';

			const scene = createScene({ x: -160 })
				.tween('x', 160, 1.2);
		</script>

		<div
			class="h-20 w-20 rounded-full bg-amber-400"
			style:translate="{scene.x}px"
		/>
	`;
		expect(smartIndent(input)).toBe(
			`<script>
  import { createScene } from '#lib/scene';

  const scene = createScene({ x: -160 })
    .tween('x', 160, 1.2);
</script>

<div
  class="h-20 w-20 rounded-full bg-amber-400"
  style:translate="{scene.x}px"
/>`
		);
	});
});
