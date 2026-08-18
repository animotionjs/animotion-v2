<script module lang="ts">
	import { SceneManager } from '../runtime.svelte.js';
	export const manager = new SceneManager();
</script>

<script lang="ts">
	import { createScene } from '../builder.svelte.js';
	import { setSceneManager, setSceneId } from '../context.svelte.js';

	setSceneManager(manager);
	setSceneId(() => 'progress-test');

	const scene = createScene({}).wait(1).wait(1);
</script>

<p data-testid="position">{scene.step}:{scene.progress}</p>
