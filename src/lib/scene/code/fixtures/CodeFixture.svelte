<script lang="ts">
	import { createScene } from '../../runtime/builder.svelte.js';
	import { SceneManager } from '../../runtime/runtime.svelte.js';
	import { setSceneManager, setSceneId } from '../../runtime/context.svelte.js';
	import Code from '../../../components/Code.svelte';

	let { lineNumbers = false }: { lineNumbers?: boolean } = $props();

	const manager = new SceneManager();
	setSceneManager(manager);
	setSceneId(() => 'code-fixture');

	createScene({ code: 'const alpha = true;\nconst beta = false;\nconst gamma = true;' });
</script>

<Code {lineNumbers} />
