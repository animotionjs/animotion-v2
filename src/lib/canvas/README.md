# Canvas engine

The runtime behind Animotion. It has no Svelte dependency.

## Layers

- `signal.ts` typed signals and `.to()`.
- `nodes.ts` group, rect, and text nodes.
- `code-node.ts` code block node and crossfade step.
- `steps.ts` tween, wait, tick, and parallel steps.
- `layout.ts` keyed layout step.
- `camera.ts` camera state and flight step.
- `scene.ts` scene builder, recording, timeline, and seeking.
- `project.ts` project definitions and project time helpers.
- `renderer.ts` Canvas2D renderer.
- `audio.ts` audio cue player.

## Boundary

The UI depends on two interfaces from `scene.ts`:

- `SceneDefinition` creates scene instances and exposes metadata.
- `SceneInstance` exposes the node graph, camera, audio, timeline, seeking, drawing, and snapshots.

Any authoring layer that can produce a `SceneDefinition` works with the same renderer, editor, and presentation.
