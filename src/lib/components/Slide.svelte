<script lang="ts">
	let { children } = $props();
</script>

<section
	class="@container flex aspect-video w-[min(100dvw,calc(100dvh*16/9))] flex-col items-center justify-center overflow-hidden bg-zinc-950 p-8 text-white"
>
	{@render children()}
</section>
