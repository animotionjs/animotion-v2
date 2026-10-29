<script lang="ts">
	import Code from '#lib/components/Code.svelte';
</script>

<div class="flex h-full flex-col items-center justify-center gap-6 p-16">
	<h2 class="text-7xl font-bold">Code</h2>

	<Code
		class="w-full max-w-4xl text-lg"
		lineNumbers
		code={`let count = 0;
let double = count * 2;

function increment() {
  count++;
}`}
		steps={[
			{
				replace: ['let count = 0;', 'let count = $state(0);'],
				highlight: '1'
			},
			{
				replace: ['let double = count * 2;', 'let double = $derived(count * 2);'],
				highlight: '2'
			},
			{
				append: '\n\nfunction reset() {\n  count = 0;\n}',
				highlight: '8-10'
			},
			{
				replace: ['count++;', 'count = Math.min(count + 1, 10);'],
				highlight: '5'
			}
		]}
	/>
</div>

<div data-notes>
	The code block morphs tokens instead of crossfading. The highlighted lines dim the rest.
</div>
