# Canvas engine spike

A from-scratch canvas runtime for Animotion. Svelte is used only for the editor and presentation UI. Scenes are plain TypeScript.

## Routes

- `/canvas` shows the first scene with a scrubber.
- `/canvas/editor` is the project editor.
- `/canvas/presentation` is the full presentation player.

Canvas routes disable SSR because layout and camera measurement need a real canvas.

## Scene API

```ts
import { all, defineScene, easeOut, wait } from '@animotion/canvas';

export default defineScene('intro', function* (s) {
	const title = s.h1('Animotion', { layoutKey: 'title', opacity: 0, y: 20 });

	const card = s.card(
		{ x: -260, y: 180, width: 420, height: 200, layoutKey: 'card' },
		s.h3('Canvas engine')
	);

	yield* all(title.opacity.to(1, 0.6), title.y.to(0, 0.6, easeOut));
	yield* wait(0.5);
	yield* card.x.to(260, 0.8, easeOut);
});
```

The generator is a recording DSL. `defineScene` runs it once, records the steps, applies each step to its end state, then resets the scene. Playback and seeking use the recorded steps, not generator replay.

## What is implemented

- Signals with `.to()` animation.
- Nodes: group, rect, text, code.
- Steps: tween, wait, parallel, layout, camera, code crossfade.
- Keyed layout morphs with retained, enter, and exit behavior.
- Camera flights to nodes or coordinates.
- Code block rendering with simple syntax colors and crossfade between states.
- Scene transitions by crossfade.
- Scene audio cues and a small audio player.
- Project definitions, scene timelines, and global project time helpers.
- Canvas renderer with deterministic `seek`.
- Editor with scene list, canvas preview, timeline, scene graph inspector, property list, playback, and PNG frame export.
- Presentation with step navigation, playback, scene crossfade, and fullscreen.

## What is not implemented

- Voiceover recording.
- Video encoding.
- GPU or WebGL rendering.
- Flexbox or grid layout.
- Rich text and line wrapping.
- HTML nodes or a Svelte custom renderer.
- Visual property editing.

## Authoring alternatives

The renderer and editor only depend on `SceneDefinition` and `SceneInstance`. A Svelte wrapper layer could build the same node graph and record the same timeline. An experimental Svelte custom renderer could do the same. Neither would require changes to the renderer, editor, or presentation.

The current factory and generator API stays the stable core while those alternatives are evaluated.

## Files

```text
src/canvas/
  audio.ts
  camera.ts
  code-node.ts
  CanvasStage.svelte
  demo.ts
  demo-layout.ts
  demo-project.ts
  easing.ts
  EditorTimeline.svelte
  index.ts
  layout.ts
  measure.ts
  nodes.ts
  PresentationStage.svelte
  project.ts
  renderer.ts
  scene.ts
  signal.ts
  steps.ts
```
