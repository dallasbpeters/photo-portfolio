# Handoff — board/node work

Written at commit `79106e1`. Working tree clean, `main` in sync with origin.
Everything below is on `main`; PR #4 was merged earlier and the 18 commits since
went straight to `main`.

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

**3. `refuse()` does not write `run_error`.** In `api/boards/[id]/run.ts` every
pre-flight refusal returns 422 without touching the database, so refusals are
invisible in `board_items.run_error`. Querying for errors and finding none does
**not** mean the board is healthy. **Fixing this is the highest-value next
change** — it is why diagnosing anything took three rounds.

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

---

## Next task: Elements

Dallas's spec, verbatim in substance: *"the analysis of images and the images
themselves. Build up a library of styles for reuse. Needs a cover or
representative, and a side panel for selecting just like site images."*

**Done:** `db/patches/016_elements.sql`, migrated. Columns: `name`,
`description` (the analysis text — this is the substance, it travels into
prompts), `cover_url` (separate from the list on purpose, so reordering images
does not restyle the library), `image_urls` JSONB array, `created_by`.

**Not done — all of it is visible-half work:**

1. `api/elements/index.ts` (GET list, POST create) and `api/elements/[id].ts`
   (PATCH, DELETE). Mirror `api/boards/index.ts` for auth and shape.
2. `boardsApi`-style client methods in `src/services/portfolioService.ts`.
3. A tab in `src/components/admin/BoardInsertPanel.tsx` — the `TABS` array
   around line 70 is the pattern. Grid of covers, click to apply.
4. **Save as Element** from a selection. The canvas right-click menu is
   `src/boards/CanvasMenu.tsx`; it already carries the selection.
5. Applying one: its `image_urls` into a Generate node's image input and its
   `description` into the prompt. Decide whether that is a wire or a node
   setting — a node setting avoids putting the pictures on the canvas, which is
   the whole point of an element.

---

## Known debt

- **`refuse()` does not write `run_error`** — see above. Do this first.
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
- **Batches are all-or-nothing traps.** Vectors and unfetchable URLs are now
  dropped from a batch and reported via `skippedVectors`; they used to fail the
  whole run. Watch for a third instance of this pattern.
- Canvas is 12000×9000; a new board opens on a 4000×3000 screenful in the middle.
