# Lyric Dance Rendering Architecture Rewrite

## Before

```mermaid
flowchart LR
  React[ShareableLyricDance.tsx]\n(rAF + physics + draw calls)
  Canvas2D[Canvas 2D\nbackground/text/particles]
  Audio[HTMLAudioElement]

  Audio --> React
  React --> Canvas2D
```

- The main thread owned all simulation, layout, and rasterization work.
- React updates, input handling, and canvas rendering contended for the same thread.
- Canvas 2D text and particle drawing happened in real-time each frame.

## After

```mermaid
flowchart LR
  React[ShareableLyricDance.tsx]\nUI + lifecycle only
  Hook[useLyricDanceRenderer]\nworker manager
  Worker[lyricDanceRenderer.worker.ts]\nOffscreenCanvas owner
  Baker[lyricSceneBaker.ts]\npre-bake keyframes
  Pixi[Pixi-like rendering layer]\nGPU-style scene graph

  React --> Hook
  Hook -->|INIT/PLAY/PAUSE/SEEK/DESTROY| Worker
  Worker --> Baker
  Baker --> Worker
  Worker --> Pixi
```

- Canvas is transferred once via `transferControlToOffscreen()` and never touched by main thread afterwards.
- Worker performs bake step first, emitting `BAKING` progress messages for UI.
- Playback loop is lookup + property assignment against baked keyframes.
- Main thread remains focused on controls and social UI.

## Expected performance impact

- **Lower main-thread contention:** React + input remain responsive during playback.
- **Stable frame pacing:** no per-frame physics/collision/layout on playback path.
- **Reduced GC churn:** lyric text objects are pre-created and toggled visible/invisible.
- **Faster seeks:** binary search on baked timeline instead of replaying simulation state.


## Production follow-up (real PixiJS)

- This branch uses a local `pixiLite` compatibility layer because `pixi.js` install is blocked in this execution environment.
- In your real repository environment, run `npm install pixi.js@^8.6.5`, then switch the worker import from `./pixiLite` to `pixi.js`.
- The worker now uses `new Application(); await app.init(...)` and stage/container primitives so the swap path is straightforward.
