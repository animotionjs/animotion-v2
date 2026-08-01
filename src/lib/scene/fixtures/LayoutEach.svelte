<script lang="ts">
	import { items } from './items.svelte.js';
</script>

<ul>
	{#each items as item (item.id)}
		<li data-layout={item.id} style="width:100px;height:40px">{item.name}</li>
	{/each}
</ul>
