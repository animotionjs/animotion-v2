<script lang="ts">
	import { createScene, lerp, type LayoutOptions } from '#lib/scene';

	type Scene = { items: { id: string; label: number }[] };

	const scene = createScene<Scene>({ items: [] });

	const opts: LayoutOptions = {
		enter: (p) => ({
			opacity: lerp(0, 1, p),
			transform: `translateY(${lerp(100, 0, p)}%) scale(${lerp(0.2, 1, p)})`
		}),
		exit: (p) => ({
			opacity: lerp(1, 0, p),
			transform: `translateY(${lerp(0, -100, p)}%) scale(${lerp(1, 0.2, p)})`
		})
	};

	for (let i = 0; i < 8; i++) scene.layout(addItem, 0.4, opts);
	for (let i = 0; i < 8; i++) scene.layout(removeItem, 0.4, opts);

	function addItem() {
		scene.items.push({ id: crypto.randomUUID(), label: scene.items.length + 1 });
	}

	function removeItem() {
		scene.items.shift();
	}
</script>

<div class="flex h-100 w-200 gap-4 rounded-3xl border-2 border-dashed border-amber-400 p-2">
	{#each scene.items as item (item)}
		<div
			data-layout={item.id}
			class="grid flex-1 place-content-center rounded-3xl bg-amber-400 text-8xl font-bold text-amber-950"
		>
			<span data-layout="{item.id}-text">{item.label}</span>
		</div>
	{/each}
</div>
