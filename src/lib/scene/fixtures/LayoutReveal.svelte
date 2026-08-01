<script lang="ts">
	import { createScene } from '../builder.svelte.js';
	import { SceneManager } from '../runtime.svelte.js';
	import { setSceneManager, setSceneId } from '../context.svelte.js';
	import Code from '../../components/Code.svelte';

	const manager = new SceneManager();
	setSceneManager(manager);
	setSceneId(() => 'layout-reveal-test');

	const scene = createScene({
		code: 'const x = 1',
		showCode: false
	}).layout(() => {
		scene.showCode = true;
	}, 0.5);
</script>

{#if scene.showCode}
	<div data-layout="code" class="shrink-0">
		<Code class="text-xl" />
	</div>
{/if}
