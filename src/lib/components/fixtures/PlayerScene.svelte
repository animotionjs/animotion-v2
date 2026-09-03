<script lang="ts">
	import { createScene, linear } from '../../scene/index.js';

	// a half second tween over thirty frames at the default sixty fps
	const scene = createScene({ x: 0 }).tween('x', 100, 0.5, linear);
</script>

<p data-testid="state">{scene.x.toFixed(0)}</p>
