<script lang="ts">
	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();
</script>

<div class="flex min-h-dvh w-dvw items-center justify-center bg-background text-foreground">
	<div class="flex w-full max-w-2xl flex-col items-center gap-4 px-8 py-16 text-center">
		<span class="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 opacity-70">
			<svg
				width="22"
				height="22"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="11" cy="11" r="7" />
				<path d="m21 21-4.3-4.3" />
			</svg>
		</span>
		<p class="text-sm tracking-widest uppercase opacity-50">Presentation not found</p>
		<h1 class="text-2xl font-bold text-balance">
			There's no presentation named <span class="break-all">"{slug}"</span>
		</h1>
		<a class="rounded-lg bg-white/10 px-4 py-2 hover:bg-white/15" href="/">Back to projects</a>
	</div>
</div>
