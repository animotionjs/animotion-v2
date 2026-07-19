<script lang="ts">
	let { children } = $props();
</script>

<section
	class="@container flex flex-col items-center justify-center overflow-hidden bg-zinc-950 p-8 text-white w-[min(100dvw,calc(100dvh*16/9))] aspect-video"
>
	{@render children()}
</section>
