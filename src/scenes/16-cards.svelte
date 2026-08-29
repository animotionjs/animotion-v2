<script lang="ts">
	import { Code, code, createScene } from '#lib/scene';

	type Card = { id: string; emoji: string; color: string; z: number };

	const DECK: Card[] = [
		{ id: 'c1', emoji: '🦊', color: 'from-orange-400 to-red-500', z: 1 },
		{ id: 'c2', emoji: '🐼', color: 'from-zinc-300 to-zinc-500', z: 2 },
		{ id: 'c3', emoji: '🐸', color: 'from-lime-400 to-emerald-600', z: 3 },
		{ id: 'c4', emoji: '🦁', color: 'from-amber-300 to-orange-600', z: 4 },
		{ id: 'c5', emoji: '🐙', color: 'from-fuchsia-400 to-purple-600', z: 5 },
		{ id: 'c6', emoji: '🐢', color: 'from-teal-300 to-green-600', z: 6 },
		{ id: 'c7', emoji: '🦄', color: 'from-pink-300 to-violet-600', z: 7 },
		{ id: 'c8', emoji: '🐝', color: 'from-yellow-300 to-amber-500', z: 8 }
	];

	let topZ = DECK.length;

	function dealCard(s: { hand: Card[]; deck: Card[] }) {
		const card = s.deck.pop();
		if (card) {
			card.z = ++topZ;
			s.hand.push(card);
		}
	}

	function removeCard(s: { hand: Card[]; deck: Card[] }) {
		const card = s.hand.pop();
		if (card) {
			card.z = ++topZ;
			s.deck.push(card);
		}
	}

	function spreadAndPeek(s: { hand: Card[]; spread: number; peeking: string | null }) {
		s.spread = 1.25;
		const card = s.hand[Math.floor(s.hand.length / 2)];
		if (card) s.peeking = card.id;
	}

	function unpeek(s: { spread: number; peeking: string | null }) {
		s.spread = 1;
		s.peeking = null;
	}

	function fan(i: number, n: number, card: Card, spread: number, peeking: string | null): string {
		const offset = i - (n - 1) / 2;
		const angle = offset * 8 * spread;
		const x = offset * 50 * spread;
		const y = (Math.abs(offset) * 10 - 45) * spread - (card.id === peeking ? 90 : 0);
		return `translate(-50%, -100%) translate(${x}px, ${y}px) rotate(${angle}deg)`;
	}

	function pile(i: number): string {
		return `translate(-50%, -100%) translate(${-i * 3}px, ${-i * 5}px)`;
	}

	const CODE = `<script>
  const scene = createScene({
    hand: [],
    deck: ['🦊', '🐼', '🐸', '🦁', '🐙', '🐢', '🦄', '🐝']
  })
    .repeat(4, (s) => s.layout(dealCard, 0.4))
    .layout(spreadAndPeek, 0.4)
    .layout(unpeek, 0.4)
    .repeat(4, (s) => s.layout(removeCard, 0.4));
<\/script>

<div class="hand">
  {#each hand as card (card)}
    <div data-layout={card} style:transform={fan(card)}>
      {card}
    </div>
  {/each}
</div>

<div class="deck">
  {#each deck as card (card)}
    <div data-layout={card} style:transform={pile(card)}>
      {card}
    </div>
  {/each}
</div>`;

	const scene = createScene({
		hand: [] as Card[],
		deck: [...DECK],
		spread: 1,
		peeking: null,
		code: CODE,
		language: 'svelte'
	})
		.noTransition()
		.wait(0.5)
		.codeSelection(code.lines(12, 18), 0.4)
		.wait(0.6)
		.codeSelection(code.lines(20, 26), 0.4)
		.wait(0.6)
		.codeSelection(code.lines(2, 9), 0.4)
		.wait(0.6)
		.repeat(4, (s) => s.all((t) => t.layout(dealCard, 0.4).codeSelection(code.lines(6), 0.2)))
		.wait(0.5)
		.all((t) => t.layout(spreadAndPeek, 0.4).codeSelection(code.lines(7), 0.2))
		.wait(0.5)
		.all((t) => t.layout(unpeek, 0.4).codeSelection(code.lines(8), 0.1))
		.wait(0.5)
		.repeat(4, (s) => s.all((t) => t.layout(removeCard, 0.4).codeSelection(code.lines(9), 0.1)))
		.wait(0.5);
</script>

<div class="relative h-full w-full overflow-hidden bg-zinc-950">
	<div
		class="absolute grid-bg"
		style:left="-6000px"
		style:top="-4000px"
		style:width="12000px"
		style:height="8000px"
	></div>

	<div class="relative h-[50%]">
		<div class="absolute bottom-[140px] left-[calc(50%-95px)] h-[240px] w-[190px]">
			<div class="absolute bottom-0 left-1/2 h-0 w-0">
				{#each scene.hand as card, i (card.id)}
					<div
						data-layout={card.id}
						class="absolute top-0 left-0 grid h-[240px] w-[190px] place-items-center rounded-2xl border border-white/20 bg-linear-to-br shadow-xl shadow-black/40 {card.color}"
						style:transform={fan(i, scene.hand.length, card, scene.spread, scene.peeking)}
						style:transform-origin="bottom center"
						style:z-index={card.z}
					>
						<span class="text-9xl drop-shadow">{card.emoji}</span>
					</div>
				{/each}
			</div>
		</div>

		<div class="absolute right-[40px] bottom-[40px] h-[240px] w-[190px]">
			<div class="absolute bottom-0 left-1/2 h-0 w-0">
				{#each scene.deck as card, i (card.id)}
					<div
						data-layout={card.id}
						class="absolute top-0 left-0 grid h-[240px] w-[190px] place-items-center rounded-2xl border border-white/20 bg-linear-to-br shadow-xl shadow-black/40 {card.color}"
						style:transform={pile(i)}
						style:transform-origin="bottom center"
						style:z-index={card.z}
					>
						<span class="text-9xl drop-shadow">{card.emoji}</span>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<div
		class="absolute inset-x-0 bottom-0 flex h-[50%] items-center justify-center bg-black/60 p-6 backdrop-blur"
	>
		<Code class="text-4xl leading-tight" />
	</div>
</div>

<style>
	.grid-bg {
		background-image: linear-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px),
			linear-gradient(90deg, rgb(255 255 255 / 0.06) 1px, transparent 1px);
		background-size: 100px 100px;
	}
</style>
