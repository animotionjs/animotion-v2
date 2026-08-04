<script lang="ts">
	import { createScene } from '#lib/scene';

	const TEXT = [
		'⣿⣿⣿⣿⣿⣿⣿⠿⠛⠛⠛⠛⠿⣿⣿⣿',
		'⣿⣿⣿⡿⠟⠋⠀⢀⣠⣤⣤⣄⡀⠀⠻⣿',
		'⣿⡿⠋⠀⢀⣤⣶⣿⣿⡿⢿⣿⣷⡄⠀⢹',
		'⣿⠁⠀⣴⣿⣿⠿⠋⠁⣀⣀⠉⠻⠃⠀⢸',
		'⣿⡀⠀⢿⣿⣷⣤⣾⣿⣿⣿⣿⣦⠀⠀⢿',
		'⣿⠃⠀⠈⠙⠿⠿⠟⠋⢁⣼⣿⣿⠀⠀⢸',
		'⡇⠀⠀⣿⣶⣆⢀⣤⣾⣿⣿⠟⠋⠀⢠⣿',
		'⣿⡄⠀⠙⢿⣿⣿⣿⠟⠋⠀⢀⣠⣶⣿⣿',
		'⣿⣿⣦⣀⡀⠀⠀⠀⣀⣠⣶⣿⣿⣿⣿⣿',
		'⠛⠛⠛⠛⠛⠛⠚⠛⠛⠛⠛⠛⠛⠛⠛⠛'
	] as const;
	const ROWS = TEXT.length;
	const COLS = Math.max(...TEXT.map((line) => line.length));
	const WAVE_LENGTH = COLS + ROWS;
	const WAVE_DURATION = 6;
	const WAVE_SPEED = (WAVE_LENGTH * 2) / WAVE_DURATION;

	const cells = TEXT.flatMap((line, row) =>
		Array.from({ length: COLS }, (_, column) => ({
			char: line[column] ?? ' ',
			row,
			column
		}))
	);

	let waveOffset = $state(0);

	function opacityFor(row: number, column: number) {
		const phase = (column + row - waveOffset + WAVE_LENGTH) % WAVE_LENGTH;
		const distance = Math.min(phase, WAVE_LENGTH - phase);
		return 0.2 + 0.8 * Math.exp(-(distance * distance) / 7);
	}

	function paint(time: number) {
		waveOffset = (time * WAVE_SPEED) % WAVE_LENGTH;
	}

	createScene()
		.fadeTransition({ duration: 0.4 })
		.tick(({ time }) => paint(time), WAVE_DURATION);
</script>

<pre
	class="font-mono text-7xl leading-none text-[#ff3e00]"
	style:position="relative"
	style:white-space="pre"
	style:width="{COLS}ch"
	style:height="{ROWS}em"
	style:overflow="hidden">
	{#each cells as cell (cell.row * COLS + cell.column)}
		<span
			style:position="absolute"
			style:left="{cell.column}ch"
			style:top="{cell.row}em"
			style:opacity={opacityFor(cell.row, cell.column)}>{cell.char}</span
		>
	{/each}
</pre>
