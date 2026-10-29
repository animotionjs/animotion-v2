# Slides

A small presentation engine for this branch. The app has a presentations dashboard, a presentation route, and a speaker view. There is no builder, timeline, camera, audio, or video renderer.

## Run it

```sh
pnpm dev
```

Open `/` to see the presentations dashboard. Pick a presentation to open `/presentation/<slug>`, for example `/presentation/example`.

The presentation route renders a sequence:

```svelte
<Scenes {sequence} {slug} {embed} />
```

`Scenes` loads the default sequence from `src/lib/config/scenes.ts` when no sequence is passed.

## Presentations

Presentations live in `src/presentations/<slug>/`. Each one has a `presentation.json` name file and a `scenes/` folder.

The dashboard at `/` lists them, creates new ones, and renames them. Creating a presentation writes a starter scene and opens it.

Bare `/presentation` redirects to the default presentation.

## Scenes

Scenes live in `src/presentations/example/scenes/`. Files are ordered by the number prefix:

```text
src/presentations/example/scenes/01-intro.svelte
src/presentations/example/scenes/02-layout.svelte
src/presentations/example/scenes/03-code.svelte
src/presentations/example/scenes/04-markdown.md
src/presentations/example/scenes/05-steps.md
src/presentations/example/scenes/06-markdown-layout.md
```

A `.svelte` file is a scene component. A `.md` file is one Markdown scene. The default sequence uses the `example` presentation, falling back to the first presentation when it is missing.

## Steps

Add `data-step="1"`, `data-step="2"`, and so on. A step stays hidden until the presentation reaches its number. Elements without `data-step` are always visible. The same number reveals together.

```svelte
<h1>Always visible</h1>

<p data-step="1">First</p>

<p data-step="2">Second</p>
```

Wrap several elements in one `data-step` container to reveal them together.

In Markdown, `+++` starts the next step:

```md
# Always visible

+++

This appears at step 1

+++

This appears at step 2
```

## Layout

Tag elements with `data-layout="key"`. Keys must be unique within a scene. When the step changes, the engine compares positions and sizes, then animates the difference. New keys fade in and removed keys fade out.

Manual layout keys are a Svelte attribute. Markdown scenes get the same treatment automatically: each `+++` chunk is tagged as a layout element, so the remaining prose slides into place when a new chunk appears.

```svelte
<h1 data-layout="title">Title</h1>

<div data-step="1" data-layout="panel">...</div>
```

The engine in `src/lib/slides/layout.ts` snapshots every tagged element before the step, updates the DOM, then animates the real position and size. That keeps text crisp and lets content reflow while it moves.

## Scene transitions

A scene can define its intro and exit transitions with a module export:

```svelte
<script module lang="ts">
	import type { SceneTransitionConfig } from '#lib/slides/transitions.js';

	export const transition: SceneTransitionConfig = {
		enter: 'slide',
		exit: 'fade',
		duration: 500
	};
</script>
```

The options are `slide`, `fade`, `zoom`, and `none`. A single name applies to both sides:

```ts
export const transition = 'fade';
```

Leave a side out to use the presentation default from `<Scenes>`:

```svelte
<Scenes transition="slide" duration={450} />
```

Forward means the new scene comes from the right and the old scene leaves to the left. Backward reverses both. The old scene is copied into the stage for its exit, so both transitions play at the same time.

Markdown scenes use frontmatter instead of a script block:

```md
---
enter: fade
exit: slide
duration: 600
---

# Markdown
```

## Code

`<Code>` takes an initial `code` and a list of `steps`. Each step is one slide step and can edit the previous source:

```svelte
<Code
	language="ts"
	lineNumbers
	code={`let count = 0;`}
	steps={[
		{ replace: ['count = 0', 'count = $state(0)'], highlight: '1' },
		{ append: '\n\nfunction reset() {\n  count = 0;\n}' },
		{ remove: 'function reset() {\n  count = 0;\n}' },
		{ code: 'let count = $state(10);', highlight: '1' }
	]}
/>
```

Each step supports:

- `code`: replace the whole source.
- `append` / `prepend`: add source to the end or start.
- `replace`: `[from, to]` replaces the first match.
- `remove`: removes the first match.
- `highlight`: line numbers or ranges, for example `"2-4, 7"`. Lines outside the range dim so the changed line stays readable.

The block morphs at the token level: retained tokens glide to their new position, new tokens fade in, and removed tokens fade out. It does not crossfade whole states. Highlight opacity tweens with the same clock, so the change and the selection settle together.

## Markdown

The Markdown parser is small and lives in `src/lib/slides/markdown.ts`. It supports headings, paragraphs, lists, blockquotes, horizontal rules, fenced code, bold, italic, inline code, and links. It does not support raw HTML or Svelte components. Optional frontmatter at the top of the file sets the scene transitions, as shown above.

A fence marked with `steps` holds several code states. Separate them with `+++`. The text after a separator is the highlight for the next state:

````md
```ts steps
let count = 0;
+++ 1
let count = $state(0);
+++ 2
let count = $state(0);
let double = $derived(count * 2);
```
````

The block morphs token by token, adds its states to the slide step count, and dims the lines outside each highlight.

`+++` appends a step. `===` replaces the previous step. Layout comments let a block keep its identity between replace steps:

```md
<!-- layout: title -->

# Title

<!-- layout: body -->

Body text.

===

<!-- layout: title -->

# Title

<!-- layout: body -->

Body text.

<!-- layout: note -->

A new note.
```

The title and body keep their keys, so they glide from their old position to the new one. The note is new and fades in. Keys must be unique within a scene. Blocks without a layout comment are not matched between steps, so they appear or disappear without a separate transition.

## Speaker view

Open a presentation, then press `s` or click Speaker. The speaker window shows a live preview, the current scene's notes, a timer, an outline, and next/previous controls.

You can also open `/speaker/example` directly. It connects to the presentation window through a BroadcastChannel. Controls in either window stay in sync.

The preview is a live copy of the presentation, not a screenshot. It runs the same scene transitions, layout animations, step reveals, and code morphs when the state arrives. The sync is state-based, so animations start a few milliseconds after the presenter's. It is not frame-locked.

Notes come from a hidden `[data-notes]` element in a Svelte scene:

```svelte
<div data-notes>What to say on this slide.</div>
```

Markdown scenes do not have notes yet, so the speaker view shows "No notes" for them.

## Navigation

| Key                           | Action                 |
| ----------------------------- | ---------------------- |
| `→`, `↓`, `space`, `PageDown` | Next step or scene     |
| `←`, `↑`, `PageUp`            | Previous step or scene |
| `Home` / `End`                | First / last scene     |
| `s`                           | Speaker view           |
| `f`                           | Fullscreen             |

The URL hash tracks the scene and step, for example `/presentation/example#2.1`. That makes every position a deep link.

## Changing a presentation

Edit the scenes in `src/presentations/example/scenes/`. Add a file with the next number to append a scene.

To render another presentation without the dashboard route, pass its sequence:

```svelte
<script lang="ts">
	import { Scenes } from '#lib';
	import { sequenceFor } from '#lib/config/scenes';

	const sequence = sequenceFor('my-presentation');
</script>

<Scenes {sequence} />
```

## Removed

The old scene builder, timeline, camera, audio, plugins, and video renderer are gone. Presentations, scenes, and the speaker view remain in a smaller form.
