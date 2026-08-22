<script lang="ts">
	import { Code, code, createScene, easeInOut } from '#lib/scene';

	type Tween = { x: number; code: string; language: string };

	const EXAMPLE = `
		<script>
			import { createScene } from '#lib/scene';

			const scene = createScene({ x: 0 })
				.tween('x', 100, 1);
		<\/script>

		<div style:translate="{scene.x}cqi">
			...
		</div>
	`;

	const CREATE_SCENE = `
		export function createScene(initial) {
			const state = $state(initial);
			const manager = getSceneManager();
			let steps = [];
			return state;
		}
	`;

	const TWEEN_BUILDER = `
		state.tween = (key, to, duration, ease) => {
			steps.push(
				new TweenStep(state, key, to, duration, ease)
			);
			return this;
		};
	`;

	const LOAD = `
		class SceneManager {
			load({ steps }) {
				this.steps = steps;
				this.totalSteps = steps.length;
				this.stepIndex = 0;
				this.elapsed = 0;
				this.needsStart = true;
			}
		}
	`;

	const NEXT = `
		class SceneManager {
			next() {
				if (stepCompleted) advance();
				enterStep(stepIndex);
				playCurrent();
			}

			enterStep(index) {
				const step = steps[index];
				step.start();
				elapsed = 0;
				progress = 0;
			}
		}
	`;

	const START_LOOP = `
		class SceneManager {
			#startLoop() {
				const step = currentStep();
				const frame = (now) => {
					elapsed += (now - lastFrame) / 1000;
					const p = ease(elapsed / step.duration);
					state.x = lerp(from, to, p);
					requestAnimationFrame(frame);
				};
				requestAnimationFrame(frame);
			}
		}
	`;

	const CAPTIONS = [
		'Calling `createScene` wraps values in reactive state and hands back a builder.',
		'Every chained call like `.tween` appends a step to the list and returns the builder.',
		'When the scene mounts, the manager stores its steps in order.',
		'Next starts the current step from a snapshot of the value.',
		'Every frame, the manager measures progress through the step and eases it.',
		'The eased progress goes into lerp which blends the old and new values into the one you see.'
	];

	const SEGMENTS = ['Create state', 'Register', 'Timeline', 'Step', 'Progress', 'Lerp'];

	const scene = createScene<Tween>({
		code: EXAMPLE,
		language: 'svelte',
		x: 0
	})
		.wait(1)
		.codeTo(CREATE_SCENE, 1, { language: 'ts' })
		.wait(1)
		.codeTo(TWEEN_BUILDER, 1, { language: 'ts' })
		.wait(1)
		.codeTo(LOAD, 1, { language: 'ts' })
		.wait(1)
		.codeTo(NEXT, 1, { language: 'ts' })
		.wait(1)
		.codeTo(START_LOOP, 1, { language: 'ts' })
		.wait(1)
		.all((s) => s.codeSelection(code.LAST('state.x = lerp(from, to, p)'), 0.4).tween('x', 100, 1))
		.wait(1);

	const stage = $derived(scene.step);
	const fill = (i: number) =>
		scene.step < i ? 0 : scene.step === i ? easeInOut(scene.progress) : 1;
	const captionIndex = $derived.by(() => {
		const outgoing = stage > 0 && scene.progress < 0.5;
		return outgoing ? stage - 1 : Math.min(stage, CAPTIONS.length - 1);
	});
	const captionOpacity = $derived(stage === 0 ? 1 : Math.abs(scene.progress * 2 - 1));
</script>

<div class="flex h-full min-h-0 w-full flex-col justify-center p-8">
	<div class="h-40">
		<p class="text-6xl text-zinc-100" style:opacity={captionOpacity}>
			{CAPTIONS[captionIndex]}
		</p>
	</div>

	<div class="mt-12 flex gap-4">
		{#each SEGMENTS as label, i (i)}
			<div class="relative overflow-hidden rounded bg-zinc-200 px-6 py-4 text-center">
				<div class="absolute inset-y-0 left-0 bg-amber-400" style:width="{fill(i) * 100}%"></div>
				<span class="relative text-4xl font-bold text-black">
					{label}
				</span>
			</div>
		{/each}
	</div>

	<div class="mt-12 w-full">
		<div class="flex w-full items-center overflow-hidden rounded-xl border-2 border-zinc-800 p-8">
			<div class="@container w-[calc(100%-16cqi)]">
				<div
					class="grid h-64 w-64 place-items-center rounded-full bg-amber-400"
					style:translate="{scene.x}cqi 0"
				>
					<span class="text-6xl font-bold text-black tabular-nums">
						{Math.round(scene.x)}
					</span>
				</div>
			</div>
		</div>
	</div>

	<div
		class="mt-12 grid min-h-0 flex-1 place-items-center overflow-auto rounded border-2 border-zinc-800"
	>
		<Code class="text-4xl" />
	</div>
</div>
