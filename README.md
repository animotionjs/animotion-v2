# Animotion

A Svelte engine for building animated presentations. A presentation is a sequence of scenes, each written as a Svelte component. Scenes drive their own animation with a scene builder, mixing value tweens, layout changes with FLIP animations, code that morphs between versions, per-frame ticks, and camera flights across an oversized canvas.

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
		.layout(() => (scene.view = 'circle'), 0.6, { ease: easeInOut, enter: 'scale' });
</script>

<div class="grid place-items-center gap-16">
	<p data-layout="title" class="text-6xl font-bold" style:opacity={scene.opacity}>🪄 Animotion</p>

	{#if scene.view === 'circle'}
		<div data-layout="circle" class="h-48 w-48 rounded-full bg-amber-400"></div>
	{/if}
</div>
```

The library provides the player shell (`Scene`), the animation engine (`createScene`, `SceneManager`, step types), a code component (`Code`) that morphs between source states, a camera component (`Camera`) for flying across an oversized canvas, and a plugin system (`PluginManager`, `fullscreenPlugin`).

Scenes live in `src/scenes/`. A scene is either a file (`04-code.svelte`) or a folder containing a `scene.svelte` component (`04-code/scene.svelte`), so you can colocate assets and helper components with the scene. Each scene must be prefixed with a number that sets its order in the sequence: `01-intro.svelte` plays before `02-about.svelte`. The rest of the name becomes the scene id (`intro`). The sequence is built automatically by `src/lib/config/scenes.ts`.

## Layout animations

`layout()` animates the DOM between two states with a FLIP animation. It snapshots the position and size of every element tagged with a `data-layout` attribute, calls the `change` function (which mutates scene state), and then animates the differences:

```ts
layout(change, (duration = 0.5), { scale, ease, enter, exit, enterEnd, exitEnd });
```

For each element it decides what happened:

- **Retained**: present in both states (like the title in the intro), glide from their old position and size to the new one — position via a translate tween, size via a real `width`/`height` tween. The browser lays the box out every frame, so nested text and images stay crisp, and text whose own `font-size` changed tweens the font per frame, re-wrapping live instead of riding a scaled snapshot. If `border-radius`, `background-color`, `color`, `border-color`, or `opacity` changed, those morph along too. Set `scale: true` to opt out of the per-frame layout: the final box is pinned and stretched on the GPU instead, which keeps heavy scenes smooth on weak hardware at the cost of warping whatever sits inside while it moves (children counter-scale so they end pixel-perfect).
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

FLIP motion and the `scale`/`slide` transitions are driven by `transform`, which browsers ignore on `display: inline` elements. The theme stylesheet automatically makes `span[data-layout]` `inline-block`, so animated spans work out of the box; other inline elements (`a`, `em`, `code`, …) need the same rule or a block-level element. `fade`, `clip`, and `wipe` work on plain inline elements since they only rely on `opacity`/`clip-path`.

`enter` and `exit` accept `fade` (default), `scale`, `clip` (circle reveal), `wipe` (left-to-right), `slide` (vertical: entering elements slide up in, exiting ones slide down out), or `none`. `ease` defaults to `easeInOut`. `enterEnd` and `exitEnd` set the fraction of the step at which the enter/exit transition completes (defaults `1` and `0.1`): the exit finishes quickly so removed elements are gone while the retained layout keeps settling, while entering elements animate in for the whole step.

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

## Camera

Every scene carries a built-in camera: a reactive `{ x, y, zoom, deg }` state that `<Camera />` applies to its children as a single transform. Tag the elements you want to visit with a `data-frame` attribute, then chain `.frame()` steps to fly between them:

```svelte
<script lang="ts">
	import { Camera, createScene } from '#lib/scene';

	const scene = createScene({ camera: { zoom: 1.4 } })
		.noTransition()
		.frame('title')
		.wait(1)
		.frame('detail', { zoom: 1.8 })
		.wait(1);
</script>

<Camera {scene}>
	<div data-frame="title">...</div>
	<div data-frame="detail" style:left="900px">...</div>
</Camera>
```

- The target is a framed element's id or raw canvas coordinates: `.frame({ x: -500, y: 500 })`.
- Options are optional: `{ zoom, deg, duration = 1.4, ease = easeInOut }`. Anything left out keeps its current value, so `.frame('detail')` pans there without changing the framing.
- Initial values come from `createScene({ camera: { zoom: 1.4 } })`; scenes that never mention the camera start centered at zoom 1.
- The camera is ordinary state, so you can read it anywhere reactive (`scene.camera.zoom`) or move it by hand (`scene.camera.deg += 15`).
- Rotation always turns the short way around.
- Framed elements are measured when their flight starts, not when it is declared, so layout changes earlier in the timeline are picked up automatically.

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

- `wait(seconds = 1)`: keeps the previous step's finished frame on screen for `seconds` longer, so the viewer has time to read. Waits aren't steps: they don't count toward `scene.step` or `totalSteps`, and the live player skips them. They only show up in rendered video. A wait before anything else keeps the first frame up until the first step starts.

```svelte
<script lang="ts">
	import { createScene } from '#lib/scene';

	const scene = createScene({ opacity: 0 })
		.tween('opacity', 1, 0.6)
		.wait(1.5)
		.tween('opacity', 0, 0.6);
</script>

<div style:opacity={scene.opacity}>Readable for a moment</div>
```

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

- `repeat(count, (s, i) => ...)`: runs the callback `count` times while building the timeline, so a block of steps can be repeated without repeating the builder calls by hand. The callback receives the builder and the current repetition index:

```svelte
<script lang="ts">
	import { createScene } from '#lib/scene';

	const scene = createScene().repeat(4, (s) => {
		s.tick(() => {}, 1);
	});
</script>
```

## Reading timeline progress

`createScene` exposes two read-only reactive timeline fields that let scenes react to the timeline declaratively, without animating a counter:

- `scene.step`: the 0-based index of the step currently being animated. It stays put when that step finishes and advances only when the next step starts. Waits never occupy a slot, so `step` counts only steps that do something.
- `scene.progress`: linear progress `0..1` through that step. It is `0` when a step starts and `1` when the step completes (and stays `1` while paused on a completed step). While a wait plays, it stays at `1`.

```svelte
<script lang="ts">
	import { createScene, easeOut } from '#lib/scene';

	const scene = createScene({ x: 0 }).tween('x', 200, 1).wait(1);

	const opacity = $derived(easeOut(scene.progress));
</script>

<p style:opacity>Current step: {scene.step}</p>
```

`step` and `progress` are reserved scene fields: they cannot be provided in the initial state. Because progress through a step is linear, apply an easing function (`easeOut`, `easeInOut`, ...) when visualizing it.

### Revealing a list

`scene.reveal(lead)` returns a function giving each item's opacity in a sequential reveal: item `i` fades in while step `i` plays, and earlier items stay fully visible. With `lead` left at its default `0`, item 0 is hidden until step 0 plays; `scene.reveal(1)` shows it from the start. Give the scene one step per item — a timed `tick` works when there is nothing to animate:

```svelte
<script lang="ts">
	import { createScene } from '#lib/scene';

	const scene = createScene().repeat(4, (s) => s.tick(() => {}, 1));

	const opacity = scene.reveal();
</script>

<ul class="text-8xl">
	<li style:opacity={opacity(0)}>1</li>
	<li style:opacity={opacity(1)}>2</li>
	<li style:opacity={opacity(2)}>3</li>
	<li style:opacity={opacity(3)}>4</li>
</ul>
```

### Crossfading between items

`scene.crossfade(items)` swaps between items, one per step: the current item fades out, the next one swaps in at the step's midpoint (while it is invisible), and fades in. It returns reactive `{ index, item, opacity }`. Use `repeat(items.length - 1)` steps so the last item ends the scene, and drive extra per-step effects from `scene.progress`:

```svelte
<script lang="ts">
	import { createScene } from '#lib/scene';

	const items = ['🔥', '😎', '❤️', '🪄'];

	const scene = createScene().repeat(items.length - 1, (s) => s.tick(() => {}, 0.4));

	const fade = scene.crossfade(items);
</script>

<div class="text-8xl" style:opacity={fade.opacity} style:rotate="{scene.progress}turn">
	{fade.item}
</div>
```

## Previewing a scene

The `/timeline/[[scene]]` route is a scrubbable editor for one scene at a time. Visit `/timeline` to open the first scene, or `/timeline/<id>` (e.g. `/timeline/about`) to jump straight to a scene. The URL stays in sync as you move between scenes, so a link deep-links to the exact scene.

The track shows the scene as four kinds of segment laid out left to right:

- **Enter** (shaded): the scene's enter transition, measured by dry-building it. An enter-only scene (no steps) is still the length of this segment.
- **Hold** (plain): `holdBeforeFirstStep` — the first frame held before step 0 starts.
- **Steps** (numbered): one segment per `.tween`, `.layout`, `.tick`, `.frame`, `.code` step, labelled with its index.
- **Wait** (hatched): the `wait()` that follows a step, where the scene rests without animating.

Drag anywhere on the track to scrub the playhead, or use the transport controls:

| Key | Action |
| --- | --- |
| `space` | Play / pause |
| `←` / `→` | Jump to the previous / next segment |
| `,` / `.` | Nudge one frame back / forward |
| `Home` / `End` | Restart / jump to the end |
| `l` | Toggle loop (ignored with `cmd`/`ctrl`/`alt`) |

  Every frame is driven by the same engine and FPS used to render, so what you scrub is what the renderer produces.

### Rendering from the timeline

`Preview` renders a 30 fps draft with lower-quality JPEG written to a separate `*.preview.mp4` file; `Full` captures lossless PNG frames and `Balanced` full-resolution JPEG. Every tier renders at the same size, so the layout always matches the final render.

The render attaches to the dev server you are already running, so the page never reloads, and one render runs at a time. Video renders land in `rendered/<id>.mp4` (previews in `rendered/<id>.preview.mp4`), full presentations in `rendered/video.mp4` or whatever `configure({ render: { out } })` names, and image sequences in `rendered/frames/<id>/` as `frame_000001.png` files.

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
- `render` sets the default options used by `animotion render`. `resolution` picks a size tier — `'720p'`, `'1080p'`, `'2k'`, `'4k'` — scaling the shape so its smaller side matches (e.g. `'2k'` gives 2560×1440 landscape, `'4k'` gives 3840×2160 landscape, 2160×3840 vertical, 2160×2160 square). Explicit `width`/`height` override the tier; the remaining options fall back to their defaults. `gpu` toggles hardware acceleration for the headless browser (default `true`, with an automatic software fallback when the GPU looks unavailable).
- `transition` sets the default scene transition: `{ type: 'slide' | 'fade' | 'zoom', duration?, ease?, distance?, scale? }` or `null` to disable. See [Default transition](#default-transition).

Both highlighter options are typed against shiki's bundles, so editor autocomplete suggests the valid names.

### Plugins

`src/lib/config/plugins.ts` registers plugins that hook into the presentation shell:

```ts
import { fullscreenPlugin, speakerPlugin, type Plugin } from '@animotion/core';

export const plugins: Plugin[] = [fullscreenPlugin(), speakerPlugin()];
```

A plugin is an object with a `name` and optional hooks:

- `setup(ctx)` — runs when the presentation mounts; `ctx.state` is a read-only view of the current scene and step (`sceneId`, `sceneIndex`, `totalScenes`, `step`, `totalSteps`, `stepCompleted`, `finished`), so plugins can read where the deck started, not just what changed. It may return a cleanup function.
- `onSceneChange({ id, index })` / `onStepChange(step, total)` — run as the presentation plays.
- `onKeydown(event)` — runs on every keydown; returning `true` consumes the key.

For example, a plugin that installs a listener can keep setup and cleanup together:

```ts
export const plugin: Plugin = {
	name: 'analytics',
	setup(ctx) {
		const onKeydown = (event: KeyboardEvent) => {
			console.log(ctx.state.sceneId, event.key);
		};
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	}
};
```

`fullscreenPlugin()` toggles fullscreen with the `f` key.

`speakerPlugin()` opens a speaker view — press `s` (or call `openSpeakerView()`) to pop out a window showing a live mirror of the presentation in an iframe, the current scene's notes, a timer, a clickable scene outline, and next/prev controls that drive the presentation. Because the mirror runs the real presentation (registered with the plugin in receiver mode), stepping through a scene advances in place without replaying the entrance transition.

Notes are authored in each scene in a hidden `[data-notes]` box, which the presenter forwards to the speaker view along with the presentation state (so notes can contain styled markup):

```svelte
<div data-notes>What I say when this slide is on screen.</div>
```

The speaker view opens at `/?speaker`, which the main scene route renders as `<SpeakerView>` instead of the presentation:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { Scenes, SpeakerView } from '#lib';
	import { plugins } from '#lib/config/plugins';
	import { sequence } from '#lib/config/scenes';

	const isSpeaker = $derived(page.url.searchParams.has('speaker'));
	const session = $derived(page.url.searchParams.get('session') ?? undefined);
</script>

{#if isSpeaker}
	<SpeakerView {session} />
{:else}
	<Scenes {sequence} {plugins} />
{/if}
```

For example, `/?speaker&session=demo` connects the speaker view to the `demo` session.

## Rendering a video

```sh
animotion render
```

The command starts a dev server, opens a headless browser, records every scene frame by frame, and feeds the frames straight into ffmpeg while recording, so nothing touches disk in between. See `animotion render --help` for every option. Settings you don't pass fall back to `configure({ render })`, then to built-in defaults (`60` fps, lossless PNG frames, and a worker count picked from your CPU cores). CLI flags always win over config.

Renders parallelize on their own. The renderer picks a worker count from your CPU cores, and whenever there are fewer scenes than workers it splits long scenes across them, then stitches the parts back together. Scenes shorter than about two seconds stay whole. Two flags tune this behavior: `--slices [count]` forces an exact number of slices per scene, and `--no-slices` keeps every scene in one piece.

Because every slice runs in its own tab, a split scene must drive its state purely from time or frame. Anything like `Math.random()`, `Date.now()`, or a counter that accumulates would disagree between slices. Scenes that cannot promise that should use `--no-slices`.

For quick drafts use `--preview`. It drops to 30 fps and captures lower-quality JPEG frames while keeping the full size, so the layout matches the final render. `--jpeg [quality]` does the quality swap on its own. Chromium uses hardware acceleration by default, verified with a health check that falls back to software automatically; `--no-gpu` forces software rendering, as does `gpu: false` in config. `--bench` prints what each frame costs to advance and capture, which is handy for comparing settings without rendering anything.

  By default nothing is written to disk. Pass `--frames-only` to save raw frames to `rendered/frames/` without encoding, or `--keep-frames` to keep them on disk after encoding.

### Rendering individual scenes

Pass one or more scene ids to render only those scenes, each written to its own video (`rendered/<id>.mp4`):

```sh
animotion render first # renders the first scene
animotion render 01-first 02-second # renders individual scenes
```

Scenes are matched by their id (the filename without the number prefix and `.svelte`), so `01-intro` and `intro` are equivalent. Use `--out` to name the output when rendering a single scene, e.g. `animotion render intro --out rendered/intro.mp4`. To write the whole presentation as one video per scene instead of a single combined video, pass `--separate` — each scene is written to `rendered/<id>.mp4`.

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
pnpm pack # produces animotion-core-0.0.1.tgz
```

```sh
pnpm add /path/to/animotion-core-0.0.1.tgz
```

`Scenes` ships as raw `.svelte` source using top-level `await`, and the timeline's render controls are remote functions, so enable both in your `vite.config.ts`:

```ts
sveltekit({
	compilerOptions: {
		experimental: { async: true }
	},
	experimental: { remoteFunctions: true }
});
```

### Files

Your project has these files; the template provides the boilerplate, you write the scenes:

```txt
src/
├── scenes/                               # your scenes
│   ├── 01-intro.svelte                   #   NN-name.svelte, or
│   └── 02-about/scene.svelte             #   NN-name/scene.svelte
├── lib/config/
│   ├── scenes.ts                         #   createSequence(import.meta.glob(...))
│   ├── plugins.ts                        #   plugin list (e.g. fullscreenPlugin())
│   └── configure.ts                      #   highlighter, aspect ratio, transition, render
├── routes/
│   ├── +layout.svelte                    #   imports the theme
│   ├── [[scene]]/+page.svelte            #   <Scenes {sequence} {plugins} />
│   └── timeline/[[scene]]/+page.svelte   #   <TimelineView {sequence} {sceneId} />
└── styles/
    └── theme.css                         #   Tailwind theme tokens (bg-background, ...)
```

### Shell

The presentation shell is a single component, rendered from an optional-scene route:

```svelte
<script lang="ts">
	import { Scenes } from '@animotion/core';
	import { plugins } from '#lib/config/plugins';
	import { sequence } from '#lib/config/scenes';
</script>

<Scenes {sequence} {plugins} />
```

`sequence` is built from a glob over your scenes:

```ts
import { createSequence } from '@animotion/core';

export const sequence = createSequence(
	import.meta.glob(['../../scenes/*.svelte', '../../scenes/*/scene.svelte'])
);
```

`plugins` is a list of plugins, such as `[fullscreenPlugin()]`.

`configure({ ... })` sets the highlighter, aspect ratio, default transition, and render defaults.

The project boilerplate — routes, config, and the Tailwind theme tokens the shell styles against — ships with the template.
