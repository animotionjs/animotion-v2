> ⚠️ **Work in progress**

# Animotion

A Svelte engine for building animated presentations. A presentation is a sequence of scenes, each written as a Svelte component. Scenes drive their own animation with a scene builder, mixing value tweens, layout changes with FLIP animations, code that morphs between versions, and per-frame ticks.

## Getting started

```sh
git clone https://github.com/animotionjs/animotion-v2.git
cd animotion-v2
pnpm install
pnpm dev
```

`pnpm dev` serves the example presentation; edit the scenes in `src/scenes/` to build your own.

## Usage

A presentation is an ordered `sequence` of scenes. Each scene is a component that uses `createScene` to build its animation steps:

```svelte
<script lang="ts">
	import { createScene, easeInOut } from '#lib/scene';

	const scene = createScene({ opacity: 0, view: 'title' })
		.tween('opacity', 1, 0.6)
		.layout(() => (scene.view = 'circle'), 0.6, easeInOut, { enter: 'scale' });
</script>

<div class="grid place-items-center gap-16">
	<p data-layout="title" class="text-6xl font-bold" style:opacity={scene.opacity}>🪄 Animotion</p>

	{#if scene.view === 'circle'}
		<div data-layout="circle" class="h-48 w-48 rounded-full bg-amber-400"></div>
	{/if}
</div>
```

The library provides the player shell (`Scene`), the animation engine (`createScene`, `SceneManager`, step types), a code component (`Code`) that morphs between source states, and a plugin system (`PluginManager`, `fullscreenPlugin`).

Scenes live in `src/scenes/`. A scene is either a file (`04-code.svelte`) or a folder containing a `scene.svelte` component (`04-code/scene.svelte`), so you can colocate assets and helper components with the scene. Each scene must be prefixed with a number that sets its order in the sequence: `01-intro.svelte` plays before `02-about.svelte`. The rest of the name becomes the scene id (`intro`). The sequence is built automatically by `src/lib/config/scenes.ts`.

## Layout animations

`layout()` animates the DOM between two states with a FLIP animation. It snapshots the position and size of every element tagged with a `data-layout` attribute, calls the `change` function (which mutates scene state), and then animates the differences:

```ts
layout(change, (duration = 0.5), ease, options);
```

For each element it decides what happened:

- **Retained**: present in both states (like the title in the intro), glide from their old position and size to the new one via a translate + scale tween.
- **New**: added by the change (including `{#if}` and `{#each}` items), animate in with the `enter` transition.
- **Removed**: dropped from the DOM by the change, cloned into a fixed-position "ghost" at their old spot, animated out with the `exit` transition, then removed.

Every animated element must carry a unique `data-layout` key so the step can match elements across the two states. For `{#each}` lists, use the item id:

```svelte
<ul>
	{#each scene.items as item (item)}
		<li data-layout={item}>{item}</li>
	{/each}
</ul>
```

FLIP motion and the `scale` transition are driven by `transform`, which browsers ignore on `display: inline` elements. The theme stylesheet automatically makes `span[data-layout]` `inline-block`, so animated spans work out of the box; other inline elements (`a`, `em`, `code`, …) need the same rule or a block-level element. `fade`, `clip`, and `wipe` work on plain inline elements since they only rely on `opacity`/`clip-path`.

`enter` and `exit` accept `fade` (default), `scale`, `clip` (circle reveal), `wipe` (left-to-right), or `none`.

## Scene transitions

Scenes animate in and out of the player via a transition applied to the scene container, which reads four numeric values: `opacity`, `x` and `y` (in `cqi`), and `scale`.

The built-in presets, each accepting `{ duration, ease }`:

- `slideTransition({ distance = 100 })`: horizontal slide. Direction-aware: when navigating forward the scene enters from the right and exits to the left; backward reverses this.
- `fadeTransition()`: crossfade.
- `zoomTransition({ scale = 0.5 })`: scales in/out while fading.

### Default transition

Scenes that don't declare a transition use the default configured in `configure({ transition })` — so you only set a transition on the scenes that differ from the default:

```ts
configure({ transition: { type: 'slide', duration: 0.4 } });
```

`transition` takes a preset name or `{ type: 'slide' | 'fade' | 'zoom', duration, ease, distance, scale }`; set it to `null` to disable the default entirely. The default fills in whichever side a scene doesn't define — a scene with only a custom `transitionIn` still gets the default exit, and vice versa. Call `.noTransition()` in a scene to opt out completely.

### Custom transitions

`transitionIn(fn)` and `transitionOut(fn)` accept a callback `(builder, direction)` (where `direction` is `'forward'` or `'backward'`) that describes the enter and exit:

- `builder.set(key, value)`: set a value immediately, defining the start state.
- `builder.tween(key, to, duration, ease)`: tween a value to its end state; multiple tweens in one build run in parallel.

```svelte
<script lang="ts">
	import { createScene } from '#lib/scene';

	const scene = createScene()
		.transitionIn((b) => {
			b.set('opacity', 0);
			b.set('y', 20);
			b.tween('opacity', 1, 0.6);
			b.tween('y', 0, 0.6);
		})
		.transitionOut((b) => {
			b.tween('y', 20, 0.4);
			b.tween('opacity', 0, 0.4);
		});
</script>
```

The enter transition plays when a scene loads; the exit transition plays before navigating to the next scene. Presets set both builds, so you can mix them with custom ones: `.slideTransition({ duration: 0.4 }).transitionOut((b) => { ... })` keeps the slide enter and overrides only the exit. Each call replaces whichever side(s) it defines.

## Code animations

Scenes can morph source code between states. Pass initial `code` (and optional `language`) to `createScene`, render `<Code />`, then chain `code*` steps:

```svelte
<script lang="ts">
	import { createScene, Code, code } from '#lib/scene';

	createScene({
		code: `function example() {
			console.log('Hello!');
		}`
	})
		.codeTo(
			`function greet() {
				console.log('Hi!');
			}`,
			0.6
		)
		.codeInsert(code.position(3, 0), 'return 7;\n', 0.6)
		.codeReplace(code.word(2, 15, 3), 'Goodbye!', 0.6)
		.codeRemove(code.lines(3), 0.6)
		.codeReplace('greet', 'sayHi', 0.6)
		.codePrepend('// example\n', 0.4)
		.codeSelection(code.word(3, 15, 6), 0.6)
		.codeSelection();
</script>

<Code class="text-2xl" />
```

- `codeTo(code, duration)`: morph the whole snippet to new source.
- `codeAppend(code)` / `codePrepend(code)`: add to the start or end.
- `codeInsert(range, code)`: insert at a position.
- `codeReplace(range | text, code)`: replace a range; a plain string matches its first occurrence.
- `codeRemove(range)`: delete a range.
- `codeEdit(duration)`: a tagged template where edits are marked inline with `code.insert(...)` and `code.remove(...)`.
- `codeSelection(range?)`: dim everything except a range; with no argument, selects everything.

Ranges target `[line, col]` positions with **1-indexed lines and 0-indexed columns**: `code.position(line, col)`, `code.word(line, col, length)`, `code.lines(from, to)`, `code.range(sl, sc, el, ec)`. Text resolvers find occurrences by string or regex: `code.FIRST(pattern)`, `code.ALL(pattern)`, `code.LAST(pattern)`.

### Code options

The `<Code />` component accepts a few props:

- `class`: size and typography classes (default `text-2xl`).
- `lineHeight`: line height in `em` (default `1.5`).
- `unselectedOpacity`: opacity of code outside the current `codeSelection` (default `0.32`).
- `lineNumbers`: show a line-number gutter on the left (default `false`).

```svelte
<Code class="text-2xl" lineNumbers />
```

## Other steps

- `tick(onTick, duration, ease)`: runs `onTick` every frame while the step plays, so you can drive arbitrary state from the step's progress (e.g. a progress bar, a counter, a canvas or third-party animation). The callback receives `{ progress, time, deltaTime, frame }`, where `progress` is the eased 0..1 progress and `time` the elapsed seconds:

```svelte
<script lang="ts">
	import { createScene } from '#lib/scene';

	let fill = $state(0);

	createScene().tick(({ progress }) => {
		fill = progress * 100;
	}, 2.4);
</script>

<div class="h-4 rounded-full bg-amber-400" style:width="{fill}%"></div>
```

- `all((s) => ...)`: runs every step added inside the callback in parallel:

```svelte
<script lang="ts">
	import { createScene } from '#lib/scene';

	const scene = createScene({ scale: 0 }).all((s) => {
		s.tween('opacity', 1, 0.6);
		s.tween('scale', 1, 0.6);
	});
</script>
```

## Configuration

The `src/lib/config/` directory holds the presentation settings.

### Highlighter

`src/lib/config/configure.ts` configures the code highlighter:

```ts
import { configure } from '#lib/scene';

configure({
	theme: 'poimandres',
	languages: ['svelte'],
	aspectRatio: 'video',
	transition: { type: 'slide', duration: 0.4 },
	render: {
		fps: 60,
		resolution: '1080p'
	}
});
```

- `theme` is a shiki `BundledTheme` name (e.g. `'poimandres'`, `'github-dark'`, `'tokyo-night'`).
- `languages` is a `BundledLanguage[]` of languages to register beyond the defaults (typescript, javascript, html, css, json, markdown).
- `aspectRatio` is a preset that sets the on-screen slide shape and the default render resolution:
  - `'video'` — 16:9, 1920×1080 (YouTube, X, presentations; default)
  - `'vertical'` — 9:16, 1080×1920 (Reels, TikTok, Shorts)
  - `'square'` — 1:1, 1080×1080 (Instagram feed)
- `render` sets the default options used by `animotion render`. `resolution` picks a size tier — `'720p'`, `'1080p'`, `'4k'` — scaling the shape so its smaller side matches (e.g. `'4k'` gives 3840×2160 landscape, 2160×3840 vertical, 2160×2160 square). Explicit `width`/`height` override the tier; the remaining options fall back to their defaults.
- `transition` sets the default scene transition: `{ type: 'slide' | 'fade' | 'zoom', duration?, ease?, distance?, scale? }` or `null` to disable. See [Default transition](#default-transition).

Both highlighter options are typed against shiki's bundles, so editor autocomplete suggests the valid names.

### Plugins

`src/lib/config/plugins.ts` registers plugins that hook into the presentation shell:

```ts
import { fullscreenPlugin } from '#lib/plugins/fullscreen';
import type { Plugin } from '#lib/plugins/types';

export const plugins: Plugin[] = [fullscreenPlugin()];
```

`fullscreenPlugin()` toggles fullscreen with the `f` key.

## Rendering a video

```sh
animotion render
```

The CLI records the presentation into a video using Playwright and ffmpeg. See `animotion render --help` for options. The default `fps`, `width`, `height`, `jobs`, and `out` come from `configure({ render })` in `src/lib/config/configure.ts`; CLI flags override them.

### Rendering individual scenes

Pass one or more scene ids to render only those scenes, each written to its own video (`rendered/<id>.mp4`):

```sh
animotion render first # renders the first scene
animotion render 01-first 02-second # renders individual scenes
```

Scenes are matched by their id (the filename without the number prefix and `.svelte`), so `01-intro` and `intro` are equivalent. Use `--out` to name the output when rendering a single scene, e.g. `animotion render intro --out rendered/intro.mp4`.

## Styling

Global styles are defined with Tailwind CSS v4 `@theme` tokens in `src/styles/theme.css`, imported in `src/routes/+layout.svelte`. The default theme provides semantic color tokens (`--color-background`, `--color-foreground`, `--color-surface`, and `--color-accent`) used by scenes as `bg-background`, `text-foreground`, and so on. Spacing, radii, and typography scale with `cqi` so the layout resizes with the slide container.

Code-highlight colors are applied inline from the shiki theme set in `configure({ theme })`; there is no separate CSS file to import.

## Developing

```sh
pnpm install
pnpm dev        # example sequence
pnpm check      # type-check
pnpm test:unit  # unit tests
pnpm package    # build the library into dist/
```

## Using in your own project

Install `@animotion/core` into your SvelteKit project from a local build:

```sh
cd animotion-v2
pnpm pack                 # produces animotion-core-0.0.1.tgz
```

```sh
pnpm add /path/to/animotion-core-0.0.1.tgz
```

`Scenes` ships as raw `.svelte` source using top-level `await`, so enable experimental async in your `vite.config.ts`:

```ts
sveltekit({
	compilerOptions: { experimental: { async: true } }
});
```

The presentation shell is a single component, rendered from an optional-scene route:

```svelte
<script lang="ts">
	import { Scenes } from '@animotion/core';
	import { plugins } from '$lib/config/plugins';
	import { sequence } from '$lib/config/scenes';
</script>

<Scenes {sequence} {plugins} />
```

where `sequence` is built from a glob over your scenes:

```ts
import { createSequence } from '@animotion/core';

export const sequence = createSequence(
	import.meta.glob(['../../scenes/*.svelte', '../../scenes/*/scene.svelte'])
);
```

and `plugins` is a list such as `[fullscreenPlugin()]`. `configure({ ... })` sets the highlighter, aspect ratio, default transition, and render defaults. The project boilerplate — routes, config, and the Tailwind theme tokens the shell styles against — ships with the template.
