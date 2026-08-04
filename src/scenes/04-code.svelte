<script lang="ts">
	import { createScene, Code, code } from '#lib/scene';

	createScene({
		code: `function example() {
			console.log('Hello!');
		}`
	})
		.slideTransition({ duration: 0.4 })
		.codeTo(
			`function greet() {
				console.log('Hi!');
			}`,
			0.6
		)
		.codeInsert(code.position(3, 0), 'return 7;\n', 0.6)
		.codeReplace(code.word(2, 15, 3), 'Goodbye!', 0.6)
		.codeRemove(code.lines(3), 0.6)
		.codeReplace('greet', 'sayHi', 0.6)
		.codePrepend('// example\n', 0.4)
		.codeEdit(0.6)`
			function ${code.replace('sayHi', 'greet')}() {
				${code.insert('// comment\n')}console.log("${code.replace('Goodbye!', 'Hello!')}");
			}
		`
		.codeSelection(code.word(3, 15, 6), 0.6)
		.codeSelection();
</script>

<Code class="text-2xl" />
