<script lang="ts">
	import { createScene } from '../builder.svelte.js';
	import { SceneManager } from '../runtime.svelte.js';
	import { setSceneManager, setSceneId } from '../context.svelte.js';
	import { code } from '../code.svelte.js';
	import { managers } from './code-scroll-managers.js';
	import Code from '../../components/Code.svelte';

	type ScrollMode = 'both' | 'selection' | 'reveal' | 'none';

	let { scrollMode = 'both', fade = true }: { scrollMode?: ScrollMode; fade?: boolean } = $props();

	const manager = new SceneManager();
	managers.push(manager);
	setSceneManager(manager);
	setSceneId(() => 'code-scroll-fixture');

	const lines = Array.from({ length: 40 }, (_, i) => `const value${i} = ${i};`).join('\n');

	createScene({ code: 'const first = 0;' })
		.codeAppend('\n' + lines, 0.6)
		.codeSelection(code.lines(1), 0.4)
		.codeSelection(code.lines(39, 41), 0.4);
</script>

<div style="height: 80px">
	<Code {scrollMode} {fade} lineNumbers />
</div>
