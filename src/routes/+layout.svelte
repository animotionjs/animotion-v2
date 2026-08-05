<script lang="ts">
	import favicon from '../assets/favicon.svg';
	import '../styles/theme.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Animotion</title>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
