import { tokenize as svelte } from '@twinkleplop/svelte';
import { configure } from '#lib/scene';

configure({
	theme: 'animotion-dark',
	aspectRatio: 'square',
	languages: {
		svelte
	},
	transition: { type: 'slide', duration: 0.4 },
	render: {
		fps: 60,
		resolution: '1080p'
	}
});
