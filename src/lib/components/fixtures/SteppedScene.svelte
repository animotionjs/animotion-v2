<script lang="ts">
	import { createScene, getSceneId } from '../../scene/index.js';

	/*
	 * One step, so a scene change is distinguishable from the outgoing
	 * scene's position, which a fresh scene has none of.
	 */
	const scene = createScene({ opacity: 0 }).tween('opacity', 1, 0.2);

	/** The id the stage resolved for this scene, so a test can tell them apart. */
	const label = getSceneId()();
</script>

<p data-testid="stage-scene">{label}</p>
<span data-testid="stage-step" style:opacity={scene.opacity}></span>
