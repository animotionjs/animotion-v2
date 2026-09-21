<script lang="ts">
	import { createScene, Code, code } from '#lib/scene';

	createScene({
		code: {
			left: `function greet(name) {
				return name;
			}`,
			right: `function farewell(name) {
				return name;
			}`
		}
	})
		.codeBlock('left')
		.codeTo(
			`function greet(name) {
				return 'Hi ' + name;
			}`
		)
		.codeBlock('right')
		.codeTo(
			`function farewell(name) {
				return 'Bye ' + name;
			}`
		)
		.codeBlock('left')
		.codeSelection(code.lines(2))
		.codeBlock('right')
		.codeSelection(code.lines(2))
		.all((s) => {
			s.codeBlock('left').codeAppend(`\ngreet('Ada');`);
			s.codeBlock('right').codeAppend(`\nfarewell('Ada');`);
		})
		.codeBlock('left')
		.codeSelection()
		.codeBlock('right')
		.codeSelection();
</script>

<div class="flex gap-8">
	<Code name="left" class="text-2xl" />
	<Code name="right" class="text-2xl" />
</div>
