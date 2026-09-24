<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} | Animotion</title>
</svelte:head>

<main class="flex min-h-dvh items-center justify-center bg-background p-8 text-foreground">
	<section class="max-w-xl space-y-4">
		<p class="text-sm text-foreground/60">Error {page.status}</p>
		<h1 class="text-3xl font-semibold">The scene could not be loaded</h1>
		<p class="leading-7">{page.error?.message ?? 'An unexpected error occurred.'}</p>
	</section>
</main>
