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
    08-shapes.ts
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
- `s.rich(runs, props)`
- `s.h1`, `s.h2`, `s.h3`, `s.body`
- `s.rect(props)`
- `s.circle(props)`
- `s.line(props)`
- `s.polygon(props)`
- `s.spline(props)`
- `s.bezier(props)`
- `s.path(props)`
- `s.card(props, ...children)`
- `s.group(props, ...children)`
- `s.svg(props)`
- `s.code(props)`
- `s.image(props)`
- `s.video(props)`

Text wraps when `maxWidth` is set. Line breaking uses [Pretext](https://github.com/chenglou/pretext), while drawing stays on canvas. `lineHeight` is a multiple of the font size, and `measure()` returns the wrapped height so keyed layouts can follow it.

Rich text uses the same line breaking across styled runs. Each run can set its own font size, weight, family, and fill:

```ts
s.rich(
	[
		{ text: 'The engine is ', fill: '#a1a1aa' },
		{ text: 'canvas only', fontWeight: 700, fill: '#fbbf24' },
		{ text: ', including rich text.', fill: '#a1a1aa' }
	],
	{ maxWidth: 900, fontSize: 25, lineHeight: 1.5 }
);
```

Text is rasterized into a bitmap and cached at the current device scale. Scaled or moving text therefore keeps a stable glyph shape instead of being re-rasterized every frame. Canvas font faces are loaded before the first scene draw.

Rect and text fills accept solid colors, linear and radial gradients, conic gradients, and image patterns. Add `shadow` to any node:

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

A conic gradient and a repeated image pattern use the same `fill` or `stroke` slot:

```ts
s.circle({
	radius: 80,
	fill: { type: 'pattern', image: '/media/dots.svg', scale: 1 },
	stroke: {
		type: 'conic',
		startAngle: -Math.PI / 2,
		stops: [
			{ offset: 0, color: '#fbbf24' },
			{ offset: 1, color: '#38bdf8' }
		]
	},
	strokeWidth: 10
});
```

Shape nodes draw from a point list or SVG path data. `circle` accepts a radius and optional start and end angles. `line` and `polygon` use points. `spline` smooths a point list with a tension. `bezier` takes two, three, or four points. `path` takes SVG path data and optional bounds for measurement and gradients.

Rects accept a `smoothness` value. Zero uses circular corners, and a positive value switches to cubic corners. `0.6` to `0.7` reads as a soft continuous corner.

```ts
s.rect({ width: 420, height: 290, radius: 34, smoothness: 0.65 });
```

Any node can clip its children with `clip: true`, which uses its own shape. A group or a node without a path can use an explicit rounded region:

```ts
s.group(
	{ clip: { width: 320, height: 180, radius: 20 } },
	s.circle({ radius: 400, fill: '#38bdf8' })
);
```

Add `cache: true` to a node to render its subtree once into an offscreen bitmap. Moving, rotating, or scaling the node then reuses that bitmap. The cache invalidates when a child changes, when an async image or pattern loads, or when the paint changes. Use `cachePadding` when a shadow extends past the node box.

```ts
s.card({ width: 420, height: 290, cache: true, cachePadding: 96 }, ...children);
```

Image and video nodes accept `src`, `width`, `height`, `fit` (`cover`, `contain`, or `fill`), `radius`, and `smoothness`. Video is muted and looped by default. While the scene clock runs live, the video plays natively and corrects drift against the clock. When the scene is paused, scrubbed, rendered, or transitioned, the video is seeked exactly to the clock.

`svg` accepts an external `src` or inline `markup`. It uses the image pipeline, so it supports the same fit, radius, and smoothing options.

Node properties are signals:

```ts
title.opacity(); // read
title.opacity(0.5); // set
title.opacity.to(1, 0.6); // animate
```

## Steps

- `yield* signal.to(value, duration, ease)`
- `yield* springTo(signal, value, options)`
- `yield* wait(seconds)`
- `yield* all(...animations)`
- `yield* sequence(...animations)`
- `yield* loop(() => animation, iterations)`
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
- `yield* code.placeCursor(position, duration)`
- `yield* code.hideCursor(duration)`
- `s.sound(src, options)`

Layout steps use `layoutKey` nodes. Added nodes enter, removed nodes exit, retained nodes glide between measured bounds. Any easing slot accepts `spring(options)` for a damped spring curve, or use `springTo` directly.

```ts
import { spring } from '#lib/canvas/index.js';

yield * box.y.to(0, 0.8, spring({ stiffness: 140, damping: 18 }));
yield * s.layout(change, { ease: spring({ stiffness: 150, damping: 19 }) });
```

Background threads start at the current point in the recorded scene and follow the same clock when seeking:

```ts
const pulse = s.spawn(loop(() => glow.opacity.to(0.2, 0.6), 3));
yield * wait(0.4);
yield * s.join(pulse); // waits for the remaining thread time
// s.cancel(pulse) stops it at the current point
```

`spawn`, `join`, `waitFor`, and `cancel` are also exported as free functions. A loop factory runs again for each iteration, so relative values see the previous pass. The main step timeline still sets the scene duration, so use `join` or enough steps when a background thread must finish.

Camera steps target a node or explicit coordinates. Code is highlighted by twinkleplop and drawn on the canvas. A morph keeps matched tokens in place while new tokens fade in and removed tokens fade out:

```ts
const code = s.code({
	code: 'const a = 1;',
	language: 'typescript',
	fontSize: 26,
	lineHeight: 1.55,
	maxLines: 5,
	cursorFill: '#fbbf24',
	scrollFadeColor: '#101014',
	scrollFadeSize: 22
});
yield * code.morphTo('const a = 2;', 0.8);
yield * code.insertText('3', position(0, 11), 0.4);
yield * code.select(range(position(0, 0), position(0, 5)), 0.4);
yield * code.scrollTo(2, 0.4);
yield * code.placeCursor(position(2, 0), 0.2);
```

`cursorBlink` sets the caret period in seconds, or zero keeps it steady. `scrollFadeSize` adds top and bottom fades when the block scrolls, and the code token cache avoids re-highlighting unchanged source.

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
- The editor render shape follows the project size. A CLI width and height override is fitted rather than reflowed.
- Images, SVG, video, and pattern images load asynchronously. The scene redraws when they are ready, but a layout measured before an image loads may need explicit width and height.
- Cached subtrees compare their state each frame. Very large or rapidly changing subtrees should stay uncached.
- Chromium still snaps moving code glyphs. Code tokens are cached for static blocks, but a token morph can shimmer.
