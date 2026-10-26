import { defineProject } from '#lib/canvas/index.js';
import intro from './scenes/01-intro.js';
import about from './scenes/02-about.js';
import layout from './scenes/03-layout.js';
import tick from './scenes/04-tick.js';
import code from './scenes/05-code.js';
import morph from './scenes/06-morph.js';
import media from './scenes/07-media.js';
import shapes from './scenes/08-shapes.js';

export default defineProject({
	id: 'example',
	size: { width: 1920, height: 1080 },
	background: '#060608',
	scenes: [intro, about, layout, tick, code, morph, media, shapes]
});
