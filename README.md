# Animotion

A canvas engine for animated presentations. Scenes are plain TypeScript. The existing Svelte editor, timeline, transport, settings, voiceover, and presentation UI stay in place.

## Development

```sh
pnpm install
pnpm dev
```

Routes:

```text
/                         project dashboard
/editor/<slug>            existing editor UI
/presentation/<slug>      presentation player
```

The standalone `/timeline` route is removed.

## Project

```text
src/projects/example/
  project.ts
  scenes/
    01-intro.ts
    02-about.ts
    03-layout.ts
    04-tick.ts
    05-code.ts
    06-morph.ts
    07-media.ts
```

`project.ts` declares the canvas size, background, and scene order:

```ts
import { defineProject } from '#lib/canvas/index.js';
import intro from './scenes/01-intro.js';
import about from './scenes/02-about.js';

export default defineProject({
	id: 'example',
	size: { width: 1920, height: 1080 },
	background: '#060608',
	scenes: [intro, about]
});
```

## Scene

```ts
import { defineScene, easeInOut, getMeasureContext } from '#lib/canvas/index.js';

export default defineScene('intro', function* (s) {
	const title = s.text('Animotion', {
		layoutKey: 'title',
		fontSize: 86.4,
		fontWeight: 700,
		fill: '#ffffff',
		opacity: 0
	});

	yield* title.opacity.to(1, 0.6, easeInOut);

	yield* s.layout(
		() => {
			const ctx = getMeasureContext();
			const titleWidth = title.measure(ctx).width;
			const logo = s.text('🪄', { layoutKey: 'logo', fontSize: 86.4, fontWeight: 700 });

			ctx.font = title.font;
			const gap = ctx.measureText(' ').width;
			const logoWidth = logo.measure(ctx).width;

			logo.x(-(titleWidth + gap) / 2);
			title.x((logoWidth + gap) / 2);
		},
		{ duration: 0.6, enter: 'scale', ease: easeInOut }
	);
});
```

The generator runs once when the scene is created and records a step timeline. Playback and seeking use the recorded steps, not generator replay.

## Nodes

- `s.text(content, props)`
- `s.h1`, `s.h2`, `s.h3`, `s.body`
- `s.rect(props)`
- `s.card(props, ...children)`
- `s.group(props, ...children)`
- `s.code(props)`
- `s.image(props)`
- `s.video(props)`

Text wraps when `maxWidth` is set. Line breaking uses [Pretext](https://github.com/chenglou/pretext), while drawing stays on canvas. `lineHeight` is a multiple of the font size, and `measure()` returns the wrapped height so keyed layouts can follow it.

Text is rasterized into a bitmap and cached at the current device scale. Scaled or moving text therefore keeps a stable glyph shape instead of being re-rasterized every frame. Canvas font faces are loaded before the first scene draw.

Rect and text fills accept solid colors or gradients. Add `shadow` to any node:

```ts
s.card({
	fill: {
		type: 'linear',
		from: { x: 0, y: 0 },
		to: { x: 1, y: 1 },
		stops: [
			{ offset: 0, color: '#3a2a12' },
			{ offset: 1, color: '#12100d' }
		]
	},
	shadow: { color: 'rgba(0, 0, 0, 0.55)', blur: 44, offsetY: 20 }
});
```

Image and video nodes accept `src`, `width`, `height`, `fit` (`cover`, `contain`, or `fill`), and `radius`. Video is muted and looped by default and follows the scene clock.

Node properties are signals:

```ts
title.opacity(); // read
title.opacity(0.5); // set
title.opacity.to(1, 0.6); // animate
```

## Steps

- `yield* signal.to(value, duration, ease)`
- `yield* wait(seconds)`
- `yield* all(...animations)`
- `yield* tick(callback, duration, ease)`
- `yield* s.layout(change, options)`
- `yield* s.frame(target, options)`
- `yield* code.morphTo(source, duration)`
- `yield* code.insertText(text, position, duration)`
- `yield* code.replaceText(target, text, duration)`
- `yield* code.removeText(target, duration)`
- `yield* code.select(range, duration)`
- `yield* code.reveal(range, duration)`
- `yield* code.scrollTo(line, duration)`
- `s.sound(src, options)`

Layout steps use `layoutKey` nodes. Added nodes enter, removed nodes exit, retained nodes glide between measured bounds.

Camera steps target a node or explicit coordinates. Code is highlighted by twinkleplop and drawn on the canvas. A morph keeps matched tokens in place while new tokens fade in and removed tokens fade out:

```ts
const code = s.code({
	code: 'const a = 1;',
	language: 'typescript',
	fontSize: 26,
	lineHeight: 1.55
});
yield * code.morphTo('const a = 2;', 0.8);
yield * code.insertText('3', position(0, 11), 0.4);
yield * code.select(range(position(0, 0), position(0, 5)), 0.4);
```

Scenes can override the configured transition. Use `null` to disable it:

```ts
export default defineScene(
	'about',
	function* (s) {
		// ...
	},
	{
		transition: { type: 'fade', duration: 0.5 }
	}
);
```

Transitions support `slide`, `fade`, and `zoom`. Set the default in `src/lib/config/configure.ts`. The example project uses a different transition for each scene so the editor, presentation, and render all show the configured behavior.

The canvas code highlighter is registered with the TypeScript and Svelte twinkleplop tokenizers. Themes and language packages are configured once:

```ts
configure({
	theme: 'animotion-dark',
	languages: { typescript, svelte }
});
```

## Editor UI

`/editor/<slug>` keeps the existing editor:

- scene blocks and frame grid
- transport and keyboard controls
- settings menu
- chapters
- voiceover track and recording controls
- render controls
- scene preview backed by the canvas engine

The scene preview, measurement, and timing use `src/lib/canvas`. The editor chrome is unchanged.

## Presentation UI

`/presentation/<slug>` keeps the full-screen player and progress bar. Arrow keys move between steps, space plays or pauses, `f` toggles fullscreen, and `s` opens the speaker view. Scene changes update the URL, so a scene can be opened directly.

## Rendering

The existing render button records canvas scenes through the same frame protocol as before. The output shape follows the project size, and the resolution setting scales that shape. The CLI works too:

```sh
pnpm render
pnpm render intro --frames-only
```

The CLI `--width` and `--height` flags can override the shape. In that case the scene is fitted inside the frame instead of being cropped.

## Commands

```sh
pnpm dev
pnpm build
pnpm check
pnpm test:unit
pnpm lint
pnpm format
```

## Current limits

- No GPU or WebGL backend.
- No flexbox or grid layout engine.
- No HTML nodes.
- No visual property editing.
- No reveal, repeat, or crossfade step helpers from the old DOM engine.
- The editor render shape follows the project size. A CLI width and height override is fitted rather than reflowed.
- Images and video load asynchronously. The scene redraws when they are ready, but a layout measured before an image loads may need explicit width and height.
