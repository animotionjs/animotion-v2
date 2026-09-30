<script lang="ts">
	import { createScene, getSceneId } from '../../scene/index.js';

	/*
	 * No steps, so the scene is finished as soon as it loads and a single
	 * press moves on. The fade is long enough for a test to see both stages
	 * mounted at once.
	 */
	createScene().fadeTransition({ duration: 0.2 });

	/** The id the stage resolved for this scene, so a test can tell them apart. */
	const label = getSceneId()();
</script>

<p data-testid="stage-scene">{label}</p>
