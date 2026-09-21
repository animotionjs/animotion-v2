<script lang="ts">
	import { createScene, Code, code } from '#lib/scene';

	const scene = createScene({
		code: {
			left: `function greet(name) {
				return name;
			}`,
			right: `function farewell(name) {
				return name;
			}`
		}
	});

	function morphGreetings() {
		scene.codeBlock('left').codeTo(`function greet(name) {
			return 'Hi ' + name;
		}`);
		scene.codeBlock('right').codeTo(`function farewell(name) {
			return 'Bye ' + name;
		}`);
	}

	function highlightBodies() {
		scene.codeBlock('left').codeSelection(code.lines(2));
		scene.codeBlock('right').codeSelection(code.lines(2));
	}

	function appendCalls() {
		scene.codeBlock('left').codeAppend(`\ngreet('Ada');`);
		scene.codeBlock('right').codeAppend(`\nfarewell('Ada');`);
	}

	function reselectAll() {
		scene.codeBlock('left').codeSelection();
		scene.codeBlock('right').codeSelection();
	}

	morphGreetings();
	highlightBodies();
	scene.all(() => appendCalls());
	reselectAll();
</script>

<div class="flex gap-8">
	<Code name="left" class="text-2xl" />
	<Code name="right" class="text-2xl" />
</div>
