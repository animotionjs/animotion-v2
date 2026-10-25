import intro from './demo.js';
import layout from './demo-layout.js';
import { defineProject } from './project.js';

export const project = defineProject({
	id: 'canvas',
	size: { width: 1920, height: 1080 },
	background: '#09090b',
	scenes: [intro, layout]
});
