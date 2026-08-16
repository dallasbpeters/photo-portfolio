# Wave 0 — anchor foundation

The contextual bar anchors to a selected item in screen space. Two things must
be true before it can exist:

1. **The viewport must not live in React state.** It does today, so every pan
   frame re-renders `BoardCanvas` and all 900-line `BoardItemView`s. A bar
   anchored to an item would jitter with them.
2. **Selection must be keyed by id.** It is `number[]` of array indices today,
   so a bar anchored to "index 3" follows the wrong item after an undo,
   a reorder, or a delete.

Everything else in the original Wave 0 — culling, the gesture model, smart
guides — is real work the bar does not structurally depend on, and moves behind
it.

## How this is being built

`BoardCanvas.tsx` is 1537 lines and `BoardItemView.tsx` is 932. Both are in
`file-size-baseline.json` and **may only shrink**. Nearly every Wave 0 task
wants to edit those same two files, which makes them impossible to parallelise
directly.

So the work is split in two:

**Extraction (parallel).** Each model is built as a pure module in its own file,
with unit tests, importing nothing from React and nothing from the canvas. These
have no file overlap and can be built simultaneously.

| Module | File | Owns |
|---|---|---|
| Viewport | `src/boards/viewportModel.ts` | pan, zoom, clamp, `toCanvas`/`toScreen`, framing bounds |
| Selection | `src/boards/selectionModel.ts` | id-keyed set ops, marquee hit-testing, reconciliation against a changed item list |
| Guides | `src/boards/alignmentGuides.ts` | edge/centre/spacing alignment for one or many moving boxes |

**Integration (sequential, one at a time).** Wiring each model into
`BoardCanvas.tsx`, converting viewport writes to refs and direct
`style.transform`, and memoising item views. This is where the line count comes
down, and it cannot be done concurrently.

## Rules for this wave

- **No agent edits `BoardCanvas.tsx` or `BoardItemView.tsx`.** Integration is
  done separately, sequentially.
- Every module is pure: no React imports, no DOM reads except where the module's
  whole job is a DOM measurement.
- Every module ships with tests. `pnpm test` runs Vitest in **real Chromium** —
  jsdom returns null from `getContext`, so canvas assertions pass silently and
  prove nothing.
- Behaviour is verified in a browser before a task is called done, not reasoned
  about.
- `pnpm lint` must pass, which includes the 500-line ceiling and the
  migration-safety check.

## Acceptance criteria (from the spec)

- Panning and zooming a 500-item board produces **zero React re-renders of item
  components** during the gesture, verified in the React DevTools Profiler.
- Selection survives undo, reorder and deletion — keyed by `BoardItem.id`, with
  `number[]` indices nowhere in selection code.
- `pnpm lint` and `pnpm test` pass; viewport and selection logic have unit tests.

## Current state, read from source

- `src/boards/BoardCanvas.tsx:358` — `useState<number[]>` selection, by index.
- `src/boards/BoardCanvas.tsx:360` — marquee rect in React state, written per
  `pointermove`.
- `src/boards/BoardCanvas.tsx:437` — stroke points in React state, same.
- `src/boards/useCanvasViewport.ts` — the viewport hook. Holds React state; its
  `CanvasViewport` type is consumed in `BoardCanvas` and re-created each render.
- `src/boards/alignmentGuides.ts` — 137 lines, one moving box only, scans every
  item every frame. No spacing, distribution, resize snapping, frame or canvas
  edge snapping, and no multi-select support.
- None of the above has any test coverage.
