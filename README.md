# Animotion

A Svelte engine for building animated presentations. Scenes are Svelte components that animate themselves with a scene builder — tweens, layout changes, code morphing and more.

## Usage

A presentation is an ordered `sequence` of scenes. Each scene is a component that uses `createScene` to build its animation steps:

```svelte
<script lang="ts">
	import { createScene } from '#lib/scene';

	const scene = createScene({ opacity: 0, scale: 0, hidden: true })
		.slideTransition({ duration: 0.4 })
		.tween('opacity', 1, 0.6)
		.all((s) => {
			s.layout(() => (s.hidden = false), 0.6);
			s.tween('scale', 1, 0.6);
		});
</script>

<div>
	<p style:opacity={scene.opacity}>Hello</p>
	<div
		class={['h-48 w-48 rounded-full bg-amber-400', { hidden: scene.hidden }]}
		style:scale={scene.scale}
	/>
</div>
```

The library provides the player shell (`Scene`), the animation engine (`createScene`, `SceneManager`, step types), a code component (`Code`) that morphs between source states, and a plugin system (`PluginManager`, `fullscreenPlugin`).

`layout()` accepts optional enter/exit transition presets: `layout(change, duration, ease, { enter: 'clip', exit: 'fade' })` — `fade` (default), `scale`, `clip` (circle reveal), `wipe` (left-to-right), or `none`. New elements animate in with `enter`; elements removed from the DOM (including `{#if}` and `{#each}` items) animate out via a pinned ghost with `exit`.

## Configuration

The `src/lib/config/` directory holds the presentation settings.

### Highlighter

`src/lib/config/configure.ts` configures the code highlighter:

```ts
import { configure } from '#lib/scene';

configure({ theme: 'poimandres', languages: ['svelte'] });
```

- `theme` is a shiki `BundledTheme` name (e.g. `'poimandres'`, `'github-dark'`, `'tokyo-night'`).
- `languages` is a `BundledLanguage[]` of languages to register beyond the defaults (typescript, javascript, html, css, json, markdown).

Both options are typed against shiki's bundles, so editor autocomplete suggests the valid names.

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

The CLI records the presentation into a video using Playwright and ffmpeg. See `animotion render --help` for options.

### Rendering individual scenes

Pass one or more scene ids to render only those scenes, each written to its own video (`rendered/<id>.mp4`):

```sh
animotion render first # renders the first scene
animotion render 01-first 02-second # renders individual scenes
```

Scenes are matched by their id (the filename without the number prefix and `.svelte`), so `01-intro` and `intro` are equivalent. Use `--out` to name the output when rendering a single scene, e.g. `animotion render intro --out rendered/intro.mp4`.

## Styling

Global styles are defined with Tailwind CSS v4 `@theme` tokens in `src/styles/theme.css`, imported in `src/routes/+layout.svelte`. The default theme provides semantic color tokens — `--color-background`, `--color-foreground`, `--color-surface`, and `--color-accent` — used by scenes as `bg-background`, `text-foreground`, and so on. Spacing, radii, and typography scale with `cqi` so the layout resizes with the slide container.

Code-highlight colors are applied inline from the shiki theme set in `configure({ theme })` — there is no separate CSS file to import.

## Developing

```sh
pnpm install
pnpm dev        # example sequence
pnpm check      # type-check
pnpm test:unit  # unit tests
pnpm package    # build the library into dist/
```
