# Handoff — board/node work

Originally written at commit `79106e1`. The working tree currently carries the
models catalog and the Open-in-Affinity bridge below, uncommitted on `main`.

---

## Read this first — how to work in this repo

Three things cost a whole session's worth of rounds. They are not opinions.

**1. The dev server runs off the working tree.** Dallas keeps `pnpm dev`
running while you edit. A half-applied edit breaks the app under him, and
several "still broken" reports were the stale browser bundle rather than a bug.
Batch your edits, finish them, then tell him to reload.

**2. Reproduce; don't reason from source.** Every round that actually resolved
something came from calling the real endpoint or running the code in Chrome.
Reading the code and declaring it fixed produced confident wrong answers
repeatedly. Client-side behaviour (canvas, CORS, z-index, pointer events) must
be checked in a browser — there is no substitute.

Two recipes that work:

```bash
# Call the real run endpoint as the app does. signToken mints a valid JWT.
SITE=dallas-images npx tsx scripts/<throwaway>.ts     # import signToken from api/_lib/auth.js
```

Chrome MCP: navigate to `http://localhost:3006`, then `javascript_tool` to hit
`/api/...` with the token from `localStorage`, or to exercise canvas/CORS
directly. Fetch a module from the dev server (`/src/boards/Foo.tsx`) to confirm
what the browser will actually run.

**3. `refuse()` now writes `run_error`.** *(Fixed.)* In `api/boards/[id]/run.ts`
a refusal is built by `refuse()`, which carries the reason to the handler and
writes it to `board_items.run_error` before replying; `reply()` is the same
thing for the two cases with nothing to record — a 404 for an id that is not a
node of ours, and the 200 that says a stored result is still current. So
querying `run_error` now *does* tell you which nodes cannot run. It used to
tell you nothing, which is why diagnosing anything took three rounds.

Also: string-replacement edits silently no-op when the anchor does not match
(comments between `{` and `id:` bit me twice). Assert, then verify by asking the
code what it knows — e.g. `isFalModel("...")` — not by re-reading the diff.

Gates, all three, every time: `pnpm lint` (tsc), `pnpm dlx ultracite check`,
`pnpm build`. Ultracite enforces cognitive complexity ≤ 20, sorted interface
members, top-level regex, no shadowing.

---

## What is built and verified

**Batch node** (`batch`) — a window onto whatever is wired into it. Shows a
numbered contact sheet with a count; hover a thumbnail for an × to strike it
off; "Only the first N" setting. Exclusions are stored **by URL, not index**
(`config.excluded`), because a batch re-resolves every run. Adds no capability
— a frame already fans out — but makes the batch visible, which was the real
problem.

**Composite node** (`composite`) — flattens a frame's arrangement into one PNG.
Rendered in the browser (only it knows the layout), stored by the run endpoint.
Any board edit clears `config.compositeUrl` so a stale render can never be sent.

**Masking / inpainting** — paint on an image node with the mask brush, invert
toggle, per-picture. Renders to a bitmap before a run and uploads it. Works with
the Flux LoRAs. Measured: 9.16% change inside the mask vs 0.20% outside.

**Frames** — group a selection (gathers them into a grid; does *not* draw a box
round them, which used to swallow bystanders), auto-arrange, copy to a new
board, download all as a zip. Innermost frame owns its contents.

**Export** — `api/boards/[id]/export.ts` zips a node's results or a frame's
contents. Verified: 3 SVGs, valid PK archive, `unzip -l` clean.

**Models added** — background removal (BiRefNet v2, rembg), mockup placement
(Flux Kontext + max), Telegram sticker LoRA, Krea-2 bubblegum LoRA. A LoRA can
now declare its own base endpoint; assuming Flux for all of them silently
returned base-style images.

**Local tooling** — `/Applications/Vectorize.app` and `~/vectorize.sh` batch
Recraft-vectorise a folder (5 images / 17s). Key in `~/.fal_key`.

**Board light/dark theme** — the editor now has a palette of its own
(`--board-ink/surface/panel/ground` in `src/index.css`, one set in `:root` and
one in `.dark`), a ThemeToggle in the board header, and an inline pre-paint
script in `index.html` so the right theme is up before React. A *published*
board is pinned dark via `.board-fixed` — it is front end, part of the branded
site, not a surface being worked on. The elements UI is painted with these
tokens. (In the same uncommitted change set as Elements.)

---

## Elements — built and verified

Dallas's spec, verbatim in substance: *"the analysis of images and the images
themselves. Build up a library of styles for reuse. Needs a cover or
representative, and a side panel for selecting just like site images."*

An element is a named handful of pictures that share a look, the words for what
they share (an Analyse node's reading), and a cover — kept outside any board so
it outlives the board that produced it.

- **API.** `api/elements/index.ts` (GET list, POST create) and
  `api/elements/[id].ts` (PATCH, DELETE). Admin-only, mirroring the board list.
  A create copies every picture into our own blob storage first (`adoptImages`
  in `api/_lib/elements.ts`), because an element outlives its board and cannot
  keep pointing at a Pinterest pin. One picture failing does not fail the
  element — the response carries a `dropped` count. Limits live in
  `config/elements.ts` (24 images, 120 name, 2000 description) so the panel and
  the endpoint can never disagree.
- **Panel.** `ElementsTab` in `BoardInsertPanel.tsx` (the first tab): a grid of
  covers, click to place, two-press delete. Loads only when opened.
- **Save as Element.** Right-click a selection → "Save N as an element".
  `ElementModal.tsx` names it, picks the key image (the cover), and takes the
  words from a Describe node in the selection if there is one. The endpoint
  keeps the first 24 starting with the key image, so a frame-sized selection is
  told what will be left out *before* saving.
- **Applying.** An `element` node (no capability, never runs). It holds the
  library id plus a copy of the cover, name and description so the canvas can
  draw it without a request; `withElements` in `api/boards/[id]/run.ts` resolves
  the id against the library at run time, so correcting a style in one place
  re-styles every board using it. Its key image feeds a Generate node's image
  input (one wire, one job); its words ride the same wire into the prompt
  (`elementTextOf` + `withElementWords`). Analyse refuses element words, since
  handing it the answer defeats the question. A node placed for an element
  deleted from the library still shows and still runs from its stored copies.

Verified: `scripts/_probe.ts` exercises the element → generate wiring through the
real run endpoint (cover flows to the image input, words to the prompt, refusals
recorded to `run_error`); a full CRUD round-trip through `api/elements` adopted
pictures into blob storage, listed, patched and deleted them. All three gates
pass. One element ("Keycap stickers") exists in the library.

---

## Known debt

- Rotate the Google API key that appeared in a terminal transcript, and add an
  HTTP-referrer restriction.
- `GOOGLE_API_KEY` and `BLOB_READ_WRITE_TOKEN` are not linked to Vercel's
  **Development** environment.
- No download control on a single board image (only via a frame or node).
- Vector round-trip is one-way: Recraft emits SVG, and SVG inputs are refused
  by design, so an edited SVG cannot go back in as a vector. Dropping one on the
  board rasterises it to WebP.

## Facts worth not rediscovering

- **Frame membership is geometric, by centre.** Nothing is stored. The innermost
  frame owns an item. `containedBy` = what a frame *means*; `withinFrame` = what
  it *carries when dragged*.
- **Pinterest images taint the canvas.** `crossOrigin` fails outright, without
  it `toBlob` throws. `api/boards/adopt.ts` copies a foreign picture into our
  blob storage first. 12 such images are on the boards.
- **Column ownership:** the canvas owns geometry and config; the run endpoint
  owns `result`, `run_state`, `run_error`. The board save must never write those
  three or a debounced autosave will erase a paid generation.
- **fal bills before it validates**, hence the declared input shape per model
  and the pre-flight refusals.
- **A board run must not ask a source node to run.** Prompt, Join, Iterate and
  Palette are `op` items with no capability. `useGraphRun` used to POST for them
  anyway; the 422 came back as a failure, which marked the node red *and*
  doomed every node it fed, so the Generate node the board existed for was
  skipped without a request being sent. `isRunnableNodeType` now gates the step.
- **Batches are all-or-nothing traps.** Vectors and unfetchable URLs are now
  dropped from a batch and reported via `skippedVectors`; they used to fail the
  whole run. Watch for a third instance of this pattern.
- Canvas is 12000×9000; a new board opens on a 4000×3000 screenful in the middle.
