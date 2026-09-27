<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { projectCreate, projectList, projectRename } from '#lib/projects.remote';

	type Items = Awaited<ReturnType<typeof projectList>>;

	let items = $state<Items | null>(null);
	let name = $state('');
	let showForm = $state(false);
	let creating = $state(false);
	let formError = $state<string | null>(null);
	let input: HTMLInputElement | null = $state(null);
	let renaming = $state<string | null>(null);
	let renameValue = $state('');
	let renamingBusy = $state(false);
	let renameError = $state<string | null>(null);
	let renameInput: HTMLInputElement | null = $state(null);

	onMount(() => {
		refresh();
	});

	async function refresh() {
		/* Awaiting the query again may hand back cached data, so refresh first. */
		const live = projectList();
		await live.refresh();
		items = await live;
	}

	function messageOf(error: unknown) {
		if (error instanceof Error) return error.message;
		const body = (error as { body?: { message?: unknown } } | null)?.body;
		return typeof body?.message === 'string' ? body.message : String(error);
	}

	function startCreate() {
		showForm = true;
		formError = null;
		requestAnimationFrame(() => input?.focus());
	}

	function cancelCreate() {
		showForm = false;
		name = '';
		formError = null;
	}

	function startRename(item: Items[number]) {
		renaming = item.slug;
		renameValue = item.name;
		renameError = null;
		requestAnimationFrame(() => renameInput?.focus());
	}

	function cancelRename() {
		renaming = null;
		renameValue = '';
		renameError = null;
	}

	async function commitRename(slug: string) {
		if (renamingBusy || renameValue.trim() === '') return;
		renamingBusy = true;
		renameError = null;
		try {
			await projectRename({ slug, name: renameValue });
			/* Only close if this row is still the one being edited. */
			if (renaming === slug) cancelRename();
			await refresh();
		} catch (e) {
			renameError = messageOf(e);
		} finally {
			renamingBusy = false;
		}
	}

	async function create() {
		if (creating || name.trim() === '') return;
		creating = true;
		formError = null;
		try {
			const slug = await projectCreate({ name });
			await goto(`/presentation/${encodeURIComponent(slug)}`);
		} catch (e) {
			formError = messageOf(e);
		} finally {
			creating = false;
		}
	}
</script>

<div class="flex min-h-dvh w-dvw items-center justify-center bg-background text-foreground">
	<div class="flex w-full max-w-2xl flex-col gap-10 px-8 py-16">
		<header class="pt-4 text-center">
			<h1 class="text-4xl font-bold whitespace-nowrap">Animotion 🪄</h1>
		</header>

		<section class="flex flex-col gap-1">
			<div class="flex items-center gap-3 pb-1">
				<h2 class="text-sm tracking-widest uppercase opacity-50">Get started</h2>
				<div class="h-px flex-1 bg-white/10"></div>
			</div>
			{#if showForm}
				<form
					class="flex items-center gap-3 rounded-lg px-3 py-2"
					onsubmit={(e) => {
						e.preventDefault();
						create();
					}}
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M12 5v14M5 12h14" />
					</svg>
					<input
						class="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:opacity-40"
						type="text"
						placeholder="Project name"
						aria-label="Project name"
						bind:this={input}
						bind:value={name}
						disabled={creating}
						onkeydown={(e) => {
							if (e.key === 'Escape') cancelCreate();
						}}
					/>
					{#if formError}
						<span class="text-sm text-red-400">{formError}</span>
					{/if}
				</form>
			{:else}
				<button
					type="button"
					class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-lg hover:bg-white/5"
					onclick={startCreate}
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M12 5v14M5 12h14" />
					</svg>
					New Project
				</button>
			{/if}
		</section>

		<section class="flex flex-col gap-1">
			<div class="flex items-center gap-3 pb-1">
				<h2 class="text-sm tracking-widest uppercase opacity-50">Projects</h2>
				<div class="h-px flex-1 bg-white/10"></div>
			</div>
			{#if items === null}
				<p class="px-3 py-2 text-lg opacity-50">Loading…</p>
			{:else if items.length === 0}
				<p class="px-3 py-2 text-lg opacity-50">No projects yet.</p>
			{:else}
				{#each items as item (item.slug)}
					{const open = `/presentation/${encodeURIComponent(item.slug)}`}
					{const edit = `/timeline/${encodeURIComponent(item.slug)}`}
					<div class="flex items-center gap-1 rounded-lg px-3 py-2 hover:bg-white/5">
						{#if renaming === item.slug}
							<form
								class="flex min-w-0 flex-1 items-center gap-3"
								onsubmit={(e) => {
									e.preventDefault();
									commitRename(item.slug);
								}}
							>
								<input
									class="min-w-0 flex-1 bg-transparent text-lg outline-none"
									type="text"
									aria-label="Project name"
									bind:this={renameInput}
									bind:value={renameValue}
									disabled={renamingBusy}
									onkeydown={(e) => {
										if (e.key === 'Escape') cancelRename();
									}}
									onblur={() => {
										if (renaming !== item.slug) return;
										if (renameValue.trim() === '' || renameValue.trim() === item.name) {
											cancelRename();
											return;
										}
										commitRename(item.slug);
									}}
								/>
								{#if renameError}
									<span class="shrink-0 text-sm text-red-400">{renameError}</span>
								{/if}
							</form>
						{:else}
							<a class="flex min-w-0 flex-1 items-center gap-3 text-lg" href={open}>
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									class="shrink-0 opacity-70"
								>
									<path
										d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
									/>
								</svg>
								<span class="truncate">{item.name}</span>
							</a>
						{/if}
						<a
							class="shrink-0 px-1 opacity-40 hover:opacity-100"
							href={edit}
							title="Open in timeline"
							aria-label={`Open ${item.name} in timeline`}
						>
							<svg
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linejoin="round"
							>
								<path d="M8 5v14l11-7z" />
							</svg>
						</a>
						<button
							type="button"
							class="shrink-0 cursor-pointer px-1 opacity-40 hover:opacity-100"
							title="Rename project"
							aria-label={`Rename ${item.name}`}
							onclick={() => startRename(item)}
						>
							<svg
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path d="M17 3l4 4L8 20l-5 1 1-5z" />
							</svg>
						</button>
					</div>
				{/each}
			{/if}
		</section>
	</div>
</div>
