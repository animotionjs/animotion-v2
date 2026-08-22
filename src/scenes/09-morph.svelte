<script lang="ts">
	import { createScene, type LayoutTransition } from '#lib/scene';

	type State = { selected: string };

	const lateEnter: LayoutTransition = (p) => ({ opacity: p < 0.96 ? 0 : (p - 0.96) / 0.04 });

	const scene = createScene<State>({ selected: 'aldric' })
		.layout((s) => (s.selected = 'mira'), 1, { enter: lateEnter, exitEnd: 0.15 })
		.layout((s) => (s.selected = 'sylas'), 1, { enter: lateEnter, exitEnd: 0.15 })
		.layout((s) => (s.selected = 'kira'), 1, { enter: lateEnter, exitEnd: 0.15 });

	const heroes = [
		{
			id: 'aldric',
			name: 'Aldric',
			role: 'Knight',
			atk: 24,
			def: 22,
			spd: 12,
			mag: 10,
			level: 10,
			emoji: '🛡️',
			gradient: 'from-amber-300 to-orange-600',
			description: 'Veteran of the Iron Keep, sworn to hold the line behind a very large shield.'
		},
		{
			id: 'mira',
			name: 'Mira',
			role: 'Mage',
			atk: 10,
			def: 12,
			spd: 14,
			mag: 28,
			level: 8,
			emoji: '🧙‍♀️',
			gradient: 'from-sky-400 to-indigo-600',
			description: 'Arcane prodigy who insists every problem has a spell-shaped solution.'
		},
		{
			id: 'sylas',
			name: 'Sylas',
			role: 'Ranger',
			atk: 18,
			def: 14,
			spd: 24,
			mag: 16,
			level: 12,
			emoji: '🏹',
			gradient: 'from-emerald-400 to-teal-600',
			description: 'Tracks storms and prey across the wilds; the forest tells him where to aim.'
		},
		{
			id: 'kira',
			name: 'Kira',
			role: 'Rogue',
			atk: 20,
			def: 12,
			spd: 26,
			mag: 14,
			level: 9,
			emoji: '🗡️',
			gradient: 'from-fuchsia-400 to-purple-600',
			description: 'From the shadowed alleys of Vell — quick hands, quicker exits.'
		}
	];

	const statDefs = [
		{ id: 'atk', label: 'ATK' },
		{ id: 'def', label: 'DEF' },
		{ id: 'spd', label: 'SPD' },
		{ id: 'mag', label: 'MAG' }
	] as const;

	const selected = $derived(heroes.find((h) => h.id === scene.selected) ?? heroes[0]);
	const bar = (value: number) => `${Math.round((value / 30) * 100)}%`;
</script>

<div class="relative flex h-full w-full gap-8 p-8">
	<div class="relative flex w-1/4 flex-col gap-3">
		{#each heroes as hero (hero.id)}
			{#if hero.id !== scene.selected}
				<button
					data-layout="{hero.id}-card"
					class="flex h-18 cursor-pointer items-center gap-4 rounded-2xl border-2 border-transparent bg-surface p-4 text-left hover:border-zinc-600 focus-visible:border-accent"
				>
					<div
						data-layout="{hero.id}-avatar"
						class={[
							'grid h-12 w-12 shrink-0 place-items-center rounded-full bg-linear-to-br text-2xl',
							hero.gradient
						]}
					>
						{hero.emoji}
					</div>
					<div class="flex min-w-0 flex-col">
						<p
							data-layout="{hero.id}-name"
							class="truncate font-mono text-lg leading-tight font-bold"
						>
							{hero.name}
						</p>
						<p data-layout="{hero.id}-role" class="truncate font-mono text-xs opacity-60">
							{hero.role}
						</p>
					</div>
					<p data-layout="{hero.id}-lv" class="ml-auto font-mono text-sm opacity-40">
						LV {hero.level}
					</p>
				</button>
			{/if}
		{/each}
	</div>

	<div
		data-layout="{selected.id}-card"
		class="relative flex flex-1 flex-col rounded-3xl bg-surface p-8"
	>
		<div class="flex flex-1 flex-col items-center justify-center">
			<div
				data-layout="{selected.id}-avatar"
				class={[
					'grid h-32 w-32 place-items-center rounded-full bg-linear-to-br text-6xl',
					selected.gradient
				]}
			>
				{selected.emoji}
			</div>
			<p
				data-layout="{selected.id}-name"
				class="w-64 text-center font-mono text-5xl leading-tight font-bold tracking-tight"
			>
				{selected.name}
			</p>
			<p
				data-layout="{selected.id}-role"
				class="text-center font-mono text-base tracking-widest opacity-70"
			>
				{selected.role}
			</p>
			<p data-layout="{selected.id}-lv" class="text-center font-mono text-xl opacity-40">
				LV {selected.level}
			</p>
		</div>
		<div class="flex w-full flex-col items-center">
			<div class="grid w-full grid-cols-2 gap-3">
				{#each statDefs as stat (stat.id)}
					<div
						data-layout="{selected.id}-{stat.id}"
						class="rounded-xl border-2 border-zinc-700 p-3"
					>
						<div class="flex items-baseline justify-between">
							<p class="font-mono text-sm tracking-widest opacity-60">{stat.label}</p>
							<p class="font-mono text-2xl font-bold tabular-nums">{selected[stat.id]}</p>
						</div>
						<div class="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
							<div
								class="h-full rounded-full bg-accent"
								style="width: {bar(selected[stat.id])}"
							></div>
						</div>
					</div>
				{/each}
			</div>
			<p
				data-layout="{selected.id}-description"
				class="mt-5 w-full text-center font-mono text-sm leading-relaxed opacity-60"
			>
				{selected.description}
			</p>
		</div>
	</div>
</div>
