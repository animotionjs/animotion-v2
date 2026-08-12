# AGENTS.md

## Description

Animotion is a Svelte 5 engine for building animated presentations. A presentation is an ordered sequence of scenes. Each scene is a Svelte component driving its own animation via `createScene` (value tweens, FLIP layout changes, morphing code, per-frame ticks).

This codebase relies on two experimental features:

- **Async Svelte**: Allows `await` at the component top-level, inside `$derived`, and in markup.
- **Remote Functions**: Functions exported from `.remote.ts` files run on the server but are called directly by the client.

## Rules

- **Svelte 5 Runes**: Use runes (`$state`, `$derived`). Avoid legacy Svelte 4 syntax (`$:`).
- **No `$effect`**: Treat `$effect` as a last resort. Use writable `$derived`, or event handlers instead.
- **No `any`**: Strictly avoid TypeScript `any` unless structurally required.
- **Imports**: Sort logically. Group `type` imports with existing imports. Pure `type` imports go last.
- **Comments**: Explain _why_ the code exists, never _what_ it does.
- **Simplicity**: Value low-complexity solutions and code legibility over clever optimizations.
- **Workflow**: Speak simply, explain reasoning, and assume the dev server is already running.
