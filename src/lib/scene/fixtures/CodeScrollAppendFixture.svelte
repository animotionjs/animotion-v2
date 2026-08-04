<script lang="ts">
	import { createScene } from '../builder.svelte.js';
	import { SceneManager } from '../runtime.svelte.js';
	import { setSceneManager, setSceneId } from '../context.svelte.js';
	import { managers } from './code-scroll-managers.js';
	import Code from '../../components/Code.svelte';

	const manager = new SceneManager();
	managers.push(manager);
	setSceneManager(manager);
	setSceneId(() => 'code-scroll-append-fixture');

	const first = Array.from({ length: 40 }, (_, i) => `const value${i} = ${i};`).join('\n');
	const second = Array.from({ length: 40 }, (_, i) => `const extra${i} = ${i};`).join('\n');

	createScene({ code: 'const first = 0;' })
		.codeAppend('\n' + first, 0.6)
		.codeAppend('\n' + second, 0.6);
</script>

<div style="height: 80px">
	<Code lineNumbers />
</div>
