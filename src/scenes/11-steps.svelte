<script lang="ts">
	import { createScene, easeOutElastic } from '#lib/scene';

	const items = ['🔥', '😎', '❤️', '🪄'];
	const scene = createScene().repeat(items.length, (s) => s.tick(() => {}, 0.4));

	const opacity = scene.reveal();
	const fade = scene.crossfade(items);
</script>

<div class="grid grid-cols-3 place-content-center gap-24 text-center">
	<!-- step and progress -->
	<div class="space-y-8">
		<div class="text-4xl font-bold">Step</div>
		<div
			class="text-4xl"
			style:opacity={scene.progress}
			style:rotate="{easeOutElastic(scene.progress)}turn"
		>
			{items[scene.step]}
		</div>
	</div>

	<!-- reveal -->
	<div class="space-y-8">
		<div class="text-4xl font-bold">Reveal</div>
		<ul class="space-y-8 text-4xl">
			{#each items as item, i (item)}
				<li style:opacity={opacity(i)} style:rotate="{scene.progress}turn">{item}</li>
			{/each}
		</ul>
	</div>

	<!-- crossfade -->
	<div class="space-y-8">
		<div class="text-4xl font-bold">Crossfade</div>
		<div class="text-4xl" style:opacity={fade.opacity} style:rotate="{scene.progress}turn">
			{fade.item}
		</div>
	</div>
</div>
