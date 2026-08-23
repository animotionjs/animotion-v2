<script lang="ts">
	import { Camera, createScene, easeInOutQuart } from '#lib/scene';

	type Body = {
		id: string;
		name: string;
		fact: string;
		distance: string;
		diameter: string;
		size: number;
		background: string;
		halo: string;
		ring?: boolean;
		textPos?: 'right' | 'left' | 'top';
		radius: number;
		angle: number;
	};

	const bodies: Body[] = [
		{
			id: 'sun',
			name: 'The Sun',
			fact: "A G-type star holding 99.8% of the system's mass.",
			distance: '150M km from Earth',
			diameter: '1.39M km',
			size: 320,
			background: 'radial-gradient(circle at 35% 32%, #fef9c3, #f59e0b 48%, #b45309 85%)',
			halo: 'rgb(245 158 11 / 0.35)',
			radius: 0,
			angle: 0
		},
		{
			id: 'mercury',
			name: 'Mercury',
			fact: 'The smallest planet, closest to the Sun, scorched by day and frozen by night.',
			distance: '77M km from Earth',
			diameter: '4,879 km',
			size: 200,
			background: 'radial-gradient(circle at 33% 30%, #e5e7eb, #9ca3af 55%, #4b5563 92%)',
			halo: 'rgb(156 163 175 / 0.30)',
			radius: 600,
			angle: 250,
			textPos: 'top'
		},
		{
			id: 'venus',
			name: 'Venus',
			fact: 'A runaway greenhouse shrouded in sulfuric clouds.',
			distance: '41M km from Earth',
			diameter: '12,104 km',
			size: 200,
			background: 'radial-gradient(circle at 33% 30%, #fde68a, #d97706 55%, #92400e 90%)',
			halo: 'rgb(217 119 6 / 0.30)',
			radius: 1200,
			angle: 205,
			textPos: 'left'
		},
		{
			id: 'earth',
			name: 'Earth',
			fact: 'The only known world with liquid oceans.',
			distance: "You're here",
			diameter: '12,742 km',
			size: 200,
			background: 'radial-gradient(circle at 33% 30%, #bfdbfe, #2563eb 52%, #172554 92%)',
			halo: 'rgb(37 99 235 / 0.35)',
			radius: 1800,
			angle: 160
		},
		{
			id: 'mars',
			name: 'Mars',
			fact: "Home to the solar system's tallest volcano.",
			distance: '55M km from Earth',
			diameter: '6,779 km',
			size: 200,
			background: 'radial-gradient(circle at 33% 30%, #fecaca, #dc2626 55%, #7f1d1d 92%)',
			halo: 'rgb(220 38 38 / 0.30)',
			radius: 2400,
			angle: 115
		},
		{
			id: 'jupiter',
			name: 'Jupiter',
			fact: 'The largest planet, a gas giant with a centuries-old storm.',
			distance: '588M km from Earth',
			diameter: '139,820 km',
			size: 200,
			background: 'radial-gradient(circle at 33% 30%, #fef3c7, #b45309 58%, #78350f 92%)',
			halo: 'rgb(180 83 9 / 0.30)',
			radius: 3000,
			angle: 70
		},
		{
			id: 'saturn',
			name: 'Saturn',
			fact: 'A gas giant crowned with rings of ice.',
			distance: '1.28B km from Earth',
			diameter: '116,460 km',
			size: 200,
			background: 'radial-gradient(circle at 33% 30%, #fef3c7, #ca8a04 58%, #713f12 92%)',
			halo: 'rgb(202 138 4 / 0.30)',
			ring: true,
			radius: 3600,
			angle: 25
		},
		{
			id: 'uranus',
			name: 'Uranus',
			fact: 'An ice giant tipped on its side, encircled by faint rings.',
			distance: '2.6B km from Earth',
			diameter: '50,724 km',
			size: 200,
			background: 'radial-gradient(circle at 33% 30%, #cffafe, #22d3ee 55%, #0e7490 92%)',
			halo: 'rgb(34 211 238 / 0.30)',
			radius: 4200,
			angle: 340
		},
		{
			id: 'neptune',
			name: 'Neptune',
			fact: 'The windiest world, at the system edge.',
			distance: '4.35B km from Earth',
			diameter: '49,244 km',
			size: 200,
			background: 'radial-gradient(circle at 33% 30%, #c7d2fe, #4f46e5 55%, #1e1b4b 92%)',
			halo: 'rgb(79 70 229 / 0.35)',
			radius: 4800,
			angle: 295
		}
	];

	const STARFIELD_IMAGE = [
		'radial-gradient(circle at 12% 18%, white 1px, transparent 1.5px)',
		'radial-gradient(circle at 64% 42%, white 1px, transparent 1.5px)',
		'radial-gradient(circle at 38% 76%, white 1.2px, transparent 1.8px)',
		'radial-gradient(circle at 88% 84%, white 1px, transparent 1.5px)',
		'radial-gradient(circle at 78% 8%, rgb(148 163 184 / 0.7) 1px, transparent 1.5px)',
		'radial-gradient(circle at 22% 55%, rgb(148 163 184 / 0.7) 1px, transparent 1.5px)'
	].join(', ');

	const STARFIELD_SIZES =
		'700px 500px, 900px 600px, 800px 550px, 1000px 650px, 600px 450px, 850px 520px';

	const STARS = [
		{ x: 140, y: 90, s: 3, depth: 0.08 },
		{ x: 360, y: 220, s: 2, depth: 0.03 },
		{ x: 620, y: 140, s: 4, depth: 0.09 },
		{ x: 880, y: 300, s: 2, depth: 0.04 },
		{ x: 200, y: 420, s: 3, depth: 0.06 },
		{ x: 520, y: 520, s: 2, depth: 0.02 },
		{ x: 780, y: 620, s: 4, depth: 0.07 },
		{ x: 980, y: 480, s: 3, depth: 0.03 },
		{ x: 440, y: 360, s: 2, depth: 0.05 },
		{ x: 140, y: 700, s: 3, depth: 0.08 },
		{ x: 900, y: 760, s: 2, depth: 0.04 },
		{ x: 60, y: 280, s: 2, depth: 0.02 },
		{ x: 300, y: 60, s: 2, depth: 0.05 },
		{ x: 500, y: 200, s: 3, depth: 0.07 },
		{ x: 740, y: 100, s: 2, depth: 0.03 },
		{ x: 1020, y: 200, s: 3, depth: 0.06 },
		{ x: 80, y: 560, s: 2, depth: 0.04 },
		{ x: 360, y: 640, s: 3, depth: 0.08 },
		{ x: 620, y: 720, s: 2, depth: 0.03 },
		{ x: 1040, y: 660, s: 2, depth: 0.05 },
		{ x: 260, y: 820, s: 3, depth: 0.07 },
		{ x: 560, y: 900, s: 2, depth: 0.02 },
		{ x: 820, y: 880, s: 3, depth: 0.06 },
		{ x: 1000, y: 920, s: 2, depth: 0.04 },
		{ x: 420, y: 440, s: 2, depth: 0.09 },
		{ x: 680, y: 400, s: 3, depth: 0.03 }
	];

	function position(radius: number, angle: number) {
		const rad = (angle * Math.PI) / 180;
		return { x: radius * Math.cos(rad), y: radius * Math.sin(rad) };
	}

	function haloBackground(color: string) {
		return `radial-gradient(circle, ${color} 0%, transparent 70%)`;
	}

	const scene = createScene({ camera: { zoom: 0.2 } })
		.noTransition()
		.wait(0.5)
		.frame('sun', { zoom: 1, duration: 2, ease: easeInOutQuart })
		.wait(0.5)
		.frame('mercury', { zoom: 0.8, ease: easeInOutQuart })
		.wait(0.5)
		.frame('venus', { zoom: 1, ease: easeInOutQuart })
		.wait(0.5)
		.frame('earth', { zoom: 1, ease: easeInOutQuart })
		.wait(0.5)
		.frame('mars', { zoom: 1, ease: easeInOutQuart })
		.wait(0.5)
		.frame('jupiter', { zoom: 1, ease: easeInOutQuart })
		.wait(0.5)
		.frame('saturn', { zoom: 1, ease: easeInOutQuart })
		.wait(0.5)
		.frame('uranus', { zoom: 1, ease: easeInOutQuart })
		.wait(0.5)
		.frame('neptune', { zoom: 1, ease: easeInOutQuart })
		.wait(0.5)
		.frame('overview', { zoom: 0.2, duration: 2, ease: easeInOutQuart })
		.wait(0.5);
</script>

<div class="relative h-full w-full overflow-hidden bg-zinc-950">
	<div
		class="absolute inset-0"
		style:background-color="#020617"
		style:background-image={STARFIELD_IMAGE}
		style:background-size={STARFIELD_SIZES}
	></div>

	{#each STARS as star (star.x + '-' + star.y)}
		<div
			class="absolute rounded-full bg-white"
			style:width="{star.s}px"
			style:height="{star.s}px"
			style:left="{star.x - scene.camera.x * star.depth}px"
			style:top="{star.y - scene.camera.y * star.depth}px"
			style:box-shadow="0 0 {star.s * 2}px rgb(255 255 255 / 0.7)"
		></div>
	{/each}

	<Camera {scene}>
		{#each bodies as body (body.id)}
			{#if body.radius > 0}
				<div
					class="absolute rounded-full"
					style:left="{-body.radius}px"
					style:top="{-body.radius}px"
					style:width="{body.radius * 2}px"
					style:height="{body.radius * 2}px"
					style:border-width="6px"
					style:border-style="dashed"
					style:border-color="rgb(203 213 225 / 0.4)"
				></div>
			{/if}
		{/each}

		{#each bodies as body (body.id)}
			<div
				data-frame={body.id}
				class="absolute"
				style:left="{position(body.radius, body.angle).x - 750}px"
				style:top="{position(body.radius, body.angle).y - 380}px"
				style:width="1500px"
				style:height="760px"
			>
				<div
					class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
					style:width="{body.size}px"
					style:height="{body.size}px"
				>
					<div
						class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
						style:width="{body.size * 2.0}px"
						style:height="{body.size * 2.0}px"
						style:background={haloBackground(body.halo)}
					></div>
					{#if body.ring}
						<svg
							class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible"
							style:width="{body.size * 2.4}px"
							style:height="{body.size}px"
							style:max-width="none"
							style:rotate="-16deg"
						>
							<ellipse
								cx="50%"
								cy="50%"
								rx="47%"
								ry="30%"
								fill="none"
								stroke="rgb(254 243 199 / 0.5)"
								stroke-width="10"
							/>
						</svg>
					{/if}
					<div
						class="absolute top-0 left-0 h-full w-full overflow-hidden rounded-full"
						style:background={body.background}
					></div>
				</div>

				<div
					class="absolute {body.textPos === 'top'
						? 'left-1/2 -translate-x-1/2'
						: 'top-1/2 -translate-y-1/2'}"
					style:left={body.textPos === 'top'
						? undefined
						: body.textPos === 'left'
							? '20px'
							: '1000px'}
					style:bottom={body.textPos === 'top' ? '500px' : undefined}
					style:width="25cqi"
				>
					<p class="text-7xl font-bold whitespace-nowrap text-white">{body.name}</p>
					<p class="mt-6 text-2xl leading-relaxed text-slate-300">{body.fact}</p>
					<p class="mt-10 text-sm tracking-widest text-slate-400 uppercase">Distance</p>
					<p class="mt-1 text-xl font-semibold text-white">{body.distance}</p>
					<p class="mt-6 text-sm tracking-widest text-slate-400 uppercase">Diameter</p>
					<p class="mt-1 text-xl font-semibold text-white">{body.diameter}</p>
				</div>
			</div>
		{/each}

		<!-- invisible framing target for the opening and pull-back shots -->
		<div
			data-frame="overview"
			class="absolute"
			style:left="-2300px"
			style:top="-2300px"
			style:width="4600px"
			style:height="4600px"
		></div>
	</Camera>
</div>
