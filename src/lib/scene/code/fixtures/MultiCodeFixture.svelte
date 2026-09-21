<script lang="ts">
	import { createScene } from '../../runtime/builder.svelte.js';
	import { SceneManager } from '../../runtime/runtime.svelte.js';
	import { setSceneManager, setSceneId } from '../../runtime/context.svelte.js';
	import { managers } from './code-scroll-managers.js';
	import Code from '../../../components/Code.svelte';

	const manager = new SceneManager();
	managers.push(manager);
	setSceneManager(manager);
	setSceneId(() => 'multi-code-fixture');

	createScene({
		code: {
			left: 'let x = 1;',
			right: 'let y = 2;'
		}
	})
		.codeBlock('left')
		.codeTo('let x = 2;')
		.codeBlock('right')
		.codeTo('let y = 3;');
</script>

<div class="flex gap-8">
	<Code name="left" />
	<Code name="right" />
</div>
