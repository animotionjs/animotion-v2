# AGENTS.md

## Description

Animotion is a canvas engine for building animated presentations. A presentation is an ordered sequence of scenes. Each scene is a TypeScript module that builds a canvas node graph and records a timeline with generators. Svelte drives the existing editor and presentation UI.

## Rules

- **Svelte 5 Runes**: Use runes (`$state`, `$derived`). Avoid legacy Svelte 4 syntax (`$:`).
- **No `$effect`**: Treat `$effect` as a last resort. Use writable `$derived`, or event handlers instead.
- **No `any`**: Strictly avoid TypeScript `any` unless structurally required.
- **Imports**: Sort logically. Group `type` imports with existing imports. Pure `type` imports go last.
- **Comments**: Explain _why_ the code exists, never _what_ it does. Keep them simple and human readable. Avoid em dashes, en dashes, hyphens, semicolons, colons and equals signs in comment text. Use block comments for multi-line comments instead of several line comments. Single-line comments should be lowercase and without a period.
- **Simplicity**: Value low-complexity solutions and code legibility over clever optimizations. Nested ternaries are forbidden.
- **Workflow**: Speak simply, explain reasoning, and assume the dev server is already running.
- **Animations**: Use only the canvas engine API for scene animations. Do not use built-in Svelte transitions or CSS keyframes in scenes, as scenes must be renderable as video.
- **Boundary**: Keep the existing editor, timeline, transport, settings, and voiceover UI. Canvas rendering belongs behind the scene mount points.
