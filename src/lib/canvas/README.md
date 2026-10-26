# Canvas engine

The runtime behind Animotion. It has no Svelte dependency.

## Layers

- `signal.ts` typed signals and `.to()`.
- `nodes.ts` base node, group, rect, wrapped text, clipping, and subtree caching.
- `shapes.ts` circle, line, polygon, spline, bezier, and path nodes.
- `rich-text.ts` styled text runs with Pretext line breaking.
- `svg.ts` inline or linked SVG assets through the image pipeline.
- `paint.ts` solid, gradient, conic, and pattern paints, plus shadows.
- `geometry.ts` points, bounds, smooth rounded corners, and spline helpers.
- `media.ts` image and video nodes with smoothing and clock sync.
- `code-node.ts` twinkleplop-backed code block, token morph, edits, selection, caret, scrolling, and fades.
- `steps.ts` tween, wait, tick, sequence, and parallel steps, plus the shared step runner.
- `spring.ts` damped spring easing and spring driven tweens.
- `threading.ts` background threads, loop, sequence, spawn, join, and cancel helpers.
- `layout.ts` keyed layout step.
- `camera.ts` camera state and flight step.
- `scene.ts` scene builder, recording, timeline, seeking, and threads.
- `transition.ts` slide, fade, and zoom scene transitions.
- `project.ts` project definitions and project time helpers.
- `renderer.ts` Canvas2D renderer with native resolution and contain or cover fitting.
- `audio.ts` audio cue player.
- `ui.ts` editor clock adapter.

## Boundary

The UI depends on two interfaces from `scene.ts`:

- `SceneDefinition` creates scene instances and exposes metadata.
- `SceneInstance` exposes the node graph, camera, audio, threads, timeline, seeking, drawing, and snapshots.

Any authoring layer that can produce a `SceneDefinition` works with the same renderer, editor, and presentation.
