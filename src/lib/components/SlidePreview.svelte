<script lang="ts">
	import { untrack } from 'svelte';
	import { Scene, SceneManager, setSceneId, setSceneManager, type Sequence } from '#lib';

	interface Props {
		/** Scene id to render. */
		id: string;
		/** Step to fast-forward the scene to (0-based). */
		step: number;
		/** Whether the scene has finished all its steps. */
		finished: boolean;
		/** The presentation sequence. */
		sequence: Sequence;
	}

	let { id, step, finished, sequence }: Props = $props();

	// A dedicated manager per preview: the scene's `createScene` grabs it from
	// context on mount and fast-forwards to the target step thanks to the
	// pre-seeded step state. The parent remounts this component (via a key)
	// whenever the scene or step changes, starting fresh, so the seed only
	// ever reads the initial props.
	const manager = new SceneManager();
	setSceneManager(manager);
	setSceneId(() => id);
	untrack(() => manager.setStepState(id, step, finished));

	const entry = $derived(sequence.find((scene) => scene.id === id));
	const Content = $derived((await entry!.component()).default);
</script>

<div class="overflow-hidden">
	<Scene compact>
		<Content />
	</Scene>
</div>
