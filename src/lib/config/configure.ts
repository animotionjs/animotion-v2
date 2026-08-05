import { configure } from '#lib/scene';

configure({
	theme: 'poimandres',
	languages: ['svelte'],
	aspectRatio: 'video',
	render: {
		fps: 60,
		resolution: '1080p'
	}
});
