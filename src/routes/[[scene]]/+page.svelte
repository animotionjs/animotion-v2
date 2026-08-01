<script lang="ts">
	import { page } from '$app/state';
	import { sequence } from '../../lib/config/scenes';
	import Scene from '#lib/components/Scene.svelte';

	const id = $derived(page.params.scene ?? sequence[0].id);
	const scene = $derived(sequence.find((s) => s.id === id) ?? sequence[0]);
	const Content = $derived((await scene.component()).default);
</script>

<Scene>
	<Content />
</Scene>
