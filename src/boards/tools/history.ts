/**
 * Where a tool's output goes, and why the original survives it.
 *
 * ## Is `BoardItemResult.history` the right home? Yes — with two gaps.
 *
 * It is the right home. `history` is already append-only, already capped, and
 * already the thing the node's version strip renders and a selection indexes
 * into (src/types.ts:122). A tool result put anywhere else would need a second
 * gallery UI that disagreed with the first about which image is current. The
 * cap and the append are restated here rather than imported because the
 * existing implementation lives in api/boards/[id]/run.ts, which pulls in the
 * Vercel runtime and the database and cannot be imported from the browser —
 * the same reason GENERATE_PROMPT_MAX is written down twice in
 * config/nodeTypes.ts. MAX_TOOL_HISTORY below must stay equal to MAX_HISTORY
 * there.
 *
 * The two gaps, both of which land on later Wave 1 tasks:
 *
 * 1. **`BoardItemVariation` records no provenance.** It is url, width, height,
 *    description, isVector — nothing says which tool made it or what prompt it
 *    was given. Ten entries in a strip and no way to tell the rotate from the
 *    restyle. `ToolSuccess.toolId` carries it as far as the caller, but
 *    persisting it needs an additive optional field on the interface.
 *
 * 2. **There is no client write path for `result` at all.** The board PATCH
 *    deliberately drops it — "Run results are deliberately not sent back: the
 *    server owns them, and a save in flight when a generation lands must not
 *    overwrite what arrived" (portfolioService.update). Only the run endpoint
 *    writes that column, and it only runs `op` nodes on a saved graph. So a
 *    tool applied to a plain `photo` item can compute a perfectly good new
 *    `BoardItemResult` and has nowhere to put it. `api/boards/[id]/svg.ts`
 *    exists for exactly this reason — a narrow endpoint that writes `result`
 *    and nothing else — and is the precedent a tool-result endpoint should
 *    follow.
 *
 * Until then these functions return the new result and the caller holds it in
 * memory. That is enough for the bar to show a before/after and for undo to
 * work within a session, and not enough to survive a reload.
 */

import type { BoardItemResult, BoardItemVariation } from "../../types.js";

/**
 * Kept equal to MAX_HISTORY in api/boards/[id]/run.ts.
 *
 * Not imported: that module is server-only. If it changes there, change it
 * here, or a client-side append will disagree with the server's about which
 * entry fell off the end.
 */
export const MAX_TOOL_HISTORY = 40;

/**
 * The history a result already had, defensively.
 *
 * `history` is optional and was added after `variations`, so results stored
 * before it exists have none. Falling back to `variations` rather than to an
 * empty array is what keeps switching history on from stranding the images a
 * node already produced — the same fallback `priorHistoryOf` makes server-side.
 */
export const historyOf = (
  previous: BoardItemResult | null | undefined
): readonly BoardItemVariation[] => {
  if (!previous) {
    return [];
  }
  if (Array.isArray(previous.history)) {
    return previous.history;
  }
  if (Array.isArray(previous.variations)) {
    return previous.variations;
  }
  return [];
};

/**
 * The image the item started as, before any tool touched it.
 *
 * The first history entry, or — when there is no history because the item has
 * never been run — the item's own current image. This is what "revert" means,
 * and having it be a function rather than a stored field is deliberate: a
 * stored `originalUrl` can drift out of step with a history that was capped,
 * whereas this cannot be wrong about a history it is reading.
 *
 * Note the cap: after 40 entries the true original *has* fallen off the front,
 * and this returns the oldest surviving one. That is a real limitation of
 * putting tool output in `history`, and the honest answer to it is that 40
 * edits deep, "the original" is not what anyone means by revert anyway.
 */
export const originalOf = (
  previous: BoardItemResult | null | undefined,
  fallbackUrl: string | null
): BoardItemVariation | null => {
  const history = historyOf(previous);
  const [oldest] = history;
  if (oldest) {
    return oldest;
  }
  if (!fallbackUrl) {
    return null;
  }
  return {
    description: null,
    height: null,
    isVector: null,
    url: fallbackUrl,
    width: null,
  };
};

/**
 * A new result with `variation` appended. Nothing is overwritten.
 *
 * Returns a fresh object every time, and copies the history array rather than
 * pushing onto it, so the `BoardItemResult` handed in remains a valid snapshot
 * of the state before the tool ran. An undo is then "put the old object back",
 * with no reconstruction and nothing to get wrong.
 *
 * When there is no prior history the item's own image is seeded as entry zero,
 * which is what makes the first tool run on an untouched photo recoverable
 * rather than the point at which the original is lost.
 */
export const appendVariation = (
  previous: BoardItemResult | null | undefined,
  variation: BoardItemVariation,
  meta: { fingerprint?: string; itemImageUrl?: string | null; ranAt: string }
): BoardItemResult => {
  const prior = historyOf(previous);
  const seed =
    prior.length === 0 ? originalOf(previous, meta.itemImageUrl ?? null) : null;
  const history = [...(seed ? [seed] : []), ...prior, variation].slice(
    -MAX_TOOL_HISTORY
  );

  return {
    description: variation.description,
    // A tool run is not a graph run, so there is no input hash to compare
    // against. Blank rather than invented: a made-up fingerprint would make the
    // next board run believe this node was already up to date and skip it.
    fingerprint: meta.fingerprint ?? "",
    height: variation.height,
    history,
    isVector: variation.isVector,
    kind: "image",
    ranAt: meta.ranAt,
    // The newest image is what the item now shows and what a wire carries on.
    url: variation.url,
    // A tool produces one image, so `variations` — which exists for a batch —
    // holds exactly that one. The previous run's batch is preserved in history
    // above rather than here, because `variations` is "what this run made".
    variations: [variation],
    width: variation.width,
  };
};
