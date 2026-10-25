<script lang="ts">
	import '#lib/config/configure.js';
	import '../styles/theme.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Animotion</title>
	<link rel="icon" href="https://fav.farm/🪄" />
</svelte:head>

{@render children()}
