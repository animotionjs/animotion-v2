<script lang="ts">
	import { createScene, easeInOutCubic } from '#lib/scene';

	type Stat = 'atk' | 'def' | 'spd' | 'mag';

	type State = { atk: number; def: number; spd: number; mag: number; hp: number; selected: string };

	const scene = createScene<State>({ atk: 24, def: 22, spd: 12, mag: 10, hp: 90, selected: 'aldric' })
		.all((s) => {
			s.layout((s) => (s.selected = 'mira'), 0.8, { ease: easeInOutCubic });
			s.tween('atk', 10, 0.8);
			s.tween('def', 12, 0.8);
			s.tween('spd', 14, 0.8);
			s.tween('mag', 28, 0.8);
			s.tween('hp', 70, 0.8);
		})
		.all((s) => {
			s.layout((s) => (s.selected = 'sylas'), 0.8, { ease: easeInOutCubic });
			s.tween('atk', 18, 0.8);
			s.tween('def', 14, 0.8);
			s.tween('spd', 24, 0.8);
			s.tween('mag', 16, 0.8);
			s.tween('hp', 75, 0.8);
		})
		.all((s) => {
			s.layout((s) => (s.selected = 'kira'), 0.8, { ease: easeInOutCubic });
			s.tween('atk', 20, 0.8);
			s.tween('def', 12, 0.8);
			s.tween('spd', 26, 0.8);
			s.tween('mag', 14, 0.8);
			s.tween('hp', 65, 0.8);
		});

	const heroes = [
		{
			id: 'aldric',
			name: 'Aldric',
			role: 'Knight',
			atk: 24,
			def: 22,
			spd: 12,
			mag: 10,
			hp: 90,
			emoji: '🛡️',
			gradient: 'from-amber-300 to-orange-600'
		},
		{
			id: 'mira',
			name: 'Mira',
			role: 'Mage',
			atk: 10,
			def: 12,
			spd: 14,
			mag: 28,
			hp: 70,
			emoji: '🧙‍♀️',
			gradient: 'from-sky-400 to-indigo-600'
		},
		{
			id: 'sylas',
			name: 'Sylas',
			role: 'Ranger',
			atk: 18,
			def: 14,
			spd: 24,
			mag: 16,
			hp: 75,
			emoji: '🏹',
			gradient: 'from-emerald-400 to-teal-600'
		},
		{
			id: 'kira',
			name: 'Kira',
			role: 'Rogue',
			atk: 20,
			def: 12,
			spd: 26,
			mag: 14,
			hp: 65,
			emoji: '🗡️',
			gradient: 'from-fuchsia-400 to-purple-600'
		}
	];

	const statDefs: { id: Stat; label: string }[] = [
		{ id: 'atk', label: 'ATK' },
		{ id: 'def', label: 'DEF' },
		{ id: 'spd', label: 'SPD' },
		{ id: 'mag', label: 'MAG' }
	];

	const selected = $derived(heroes.find((h) => h.id === scene.selected) ?? heroes[0]);
</script>

<div class="flex h-full w-full flex-col gap-6">
	<div
		data-layout="header"
		class="flex items-center justify-between border-b-2 border-zinc-700 pb-4"
	>
		<p data-layout="title" class="font-mono text-3xl font-bold tracking-widest">PARTY</p>
	</div>

	<div class="flex flex-1 gap-6">
		<ul class="flex w-2/5 flex-col gap-3">
			{#each heroes as hero (hero.id)}
				<li
					data-layout="{hero.id}-row"
					class={[
						'relative flex h-20 items-center gap-4 rounded-xl border-2 p-4',
						hero.id === scene.selected
							? 'border-accent bg-accent/10'
							: 'border-transparent bg-surface'
					]}
				>
					{#if hero.id === scene.selected}
						<span data-layout="cursor" class="font-mono text-2xl text-accent">▸</span>
					{/if}
					<div
						data-layout="{hero.id}-mini"
						class={[
							`grid shrink-0 place-items-center rounded-full bg-linear-to-br ${hero.gradient}`,
							hero.id === scene.selected ? 'h-16 w-16' : 'h-14 w-14'
						]}
					>
						<span data-layout="{hero.id}-mini-icon" class="text-2xl">{hero.emoji}</span>
					</div>
					<div class="flex min-w-0 flex-col justify-center">
						<p
							data-layout="{hero.id}-row-name"
							class={[
								'truncate font-mono font-bold',
								hero.id === scene.selected ? 'text-2xl text-accent' : 'text-base opacity-70'
							]}
						>
							{hero.name}
						</p>
						<p
							data-layout="{hero.id}-lv"
							class={[
								'font-mono',
								hero.id === scene.selected
									? 'text-base font-bold text-accent'
									: 'text-sm opacity-40'
							]}
						>
							LV 5
						</p>
					</div>
				</li>
			{/each}
		</ul>

		<div
			data-layout="detail"
			class="flex flex-1 flex-col items-center gap-5 rounded-3xl border-2 border-zinc-700 bg-surface p-6"
		>
			<div
				data-layout="detail-profile"
				class="flex h-56 w-full flex-col items-center justify-center gap-3"
			>
				<div
					data-layout="detail-{selected.id}-portrait"
					class={[
						`grid h-32 w-32 place-items-center rounded-full bg-linear-to-br text-5xl ${selected.gradient}`
					]}
				>
					{selected.emoji}
				</div>
				<div class="flex flex-col items-center gap-1">
<p
					data-layout="detail-{selected.id}-name"
					class="w-40 text-center font-mono text-4xl font-bold tracking-tight"
				>
					{selected.name.toUpperCase()}
				</p>
				<p
					data-layout="detail-{selected.id}-role"
					class="w-28 text-center font-mono text-sm tracking-widest opacity-70"
				>
					{selected.role}
				</p>
				</div>
			</div>

			<div data-layout="detail-stats" class="grid w-full grid-cols-2 gap-3">
				{#each statDefs as stat (stat.id)}
					<div data-layout="detail-stat-{stat.id}" class="rounded-xl border-2 border-zinc-700 p-4">
						<div class="flex items-baseline justify-between">
							<p class="font-mono text-sm tracking-widest opacity-60">{stat.label}</p>
							<p
								data-layout="stat-{stat.id}"
								class="font-mono text-2xl font-bold tabular-nums"
							>
								{Math.round(scene[stat.id])}
							</p>
						</div>
						<div class="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
							<div
								class="h-full rounded-full bg-accent"
								style="width: {scene[stat.id]}%"
							></div>
						</div>
					</div>
				{/each}
			</div>

			<div data-layout="detail-hp" class="w-full">
				<div class="flex items-baseline justify-between">
					<p class="font-mono text-sm tracking-widest opacity-60">HP</p>
					<p class="font-mono text-2xl font-bold tabular-nums">{Math.round(scene.hp)}</p>
				</div>
				<div class="mt-2 h-3 overflow-hidden rounded-full bg-zinc-800">
					<div
						class="h-full rounded-full bg-linear-to-r from-emerald-400 to-teal-500"
						style="width: {scene.hp}%"
					></div>
				</div>
			</div>
		</div>
	</div>
</div>