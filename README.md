# @animotion/core

A Svelte engine for building animated presentations. Scenes are Svelte components that animate themselves with a scene builder — tweens, layout changes, code morphing and more.

## Install

```sh
pnpm add @animotion/core
```

Requires `svelte` (v5) and works inside a SvelteKit project with Tailwind CSS v4.

## Usage

A presentation is an ordered `sequence` of scenes. Each scene is a component that uses `createScene` to build its animation steps:

```svelte
<script lang="ts">
	import { createScene } from '@animotion/core';

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

## Rendering a video

```sh
animotion render
```

The CLI records the presentation into a video using Playwright and ffmpeg. See `animotion render --help` for options.

### Rendering individual scenes

Pass one or more scene ids to render only those scenes, each written to its own video (`rendered/<id>.mp4`):

```sh
animotion render intro          # renders the intro scene
animotion render 01-intro 05-tick
```

Scenes are matched by their id (the filename without the number prefix and `.svelte`), so `01-intro` and `intro` are equivalent. Use `--out` to name the output when rendering a single scene, e.g. `animotion render intro --out rendered/intro.mp4`.

## Styling

The engine's code-highlighting styles ship as `@animotion/core/styles/code-theme.css`; import it into your theme and override the `--code-*` tokens:

```css
@import '@animotion/core/styles/code-theme.css';
```

## Developing

```sh
pnpm install
pnpm dev        # example sequence
pnpm check      # type-check
pnpm test:unit  # unit tests
pnpm package    # build the library into dist/
```
