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
import { defineScene, easeInOut } from '#lib/canvas/index.js';

export default defineScene('intro', function* (s) {
	const title = s.text('Animotion', {
		layoutKey: 'title',
		fontSize: 86,
		fontWeight: 700,
		fill: '#ffffff',
		opacity: 0
	});

	yield* title.opacity.to(1, 0.6, easeInOut);

	yield* s.layout(
		() => {
			title.x(70);
			s.text('🪄', { layoutKey: 'logo', x: -230, fontSize: 86 });
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

Layout steps use `layoutKey` nodes. Added nodes enter, removed nodes exit, retained nodes glide between measured bounds.

Camera steps target a node or explicit coordinates. Code steps crossfade a canvas code block.

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

`/presentation/<slug>` keeps the full-screen player and progress bar. Arrow keys move between steps, space plays or pauses, and `f` toggles fullscreen.

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

- No video encoding from the canvas engine yet.
- No GPU or WebGL backend.
- No flexbox or grid layout engine.
- No rich text wrapping.
- No HTML nodes.
- No visual property editing.
