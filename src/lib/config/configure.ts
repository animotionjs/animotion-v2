import { tokenize as svelte } from '@twinkleplop/svelte';
import { tokenize as typescript } from '@twinkleplop/typescript';
import { configure } from '#lib/scene';

configure({
	theme: 'animotion-dark',
	languages: {
		svelte,
		typescript
	},
	transition: { type: 'slide', duration: 0.8 },
	aspectRatio: 'video',
	render: {
		fps: 60,
		resolution: '1080p'
	}
});
