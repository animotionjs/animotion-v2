import { createSequence } from '#lib/scene';
import './configure';

export const sequence = createSequence(
	import.meta.glob(['../../scenes/*.svelte', '../../scenes/*/scene.svelte'])
);
