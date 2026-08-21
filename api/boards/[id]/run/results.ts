import type { Produced } from "./capabilities.js";

/**
 * The stored shape of what a run made.
 *
 * A result is written once and read by everything afterwards — the canvas, the
 * next node down the wire, an export, a version delete — so the rules about
 * history, sparseness and what counts as the primary image live here rather
 * than being re-derived at each of those call sites.
 */

/**
 * How many past images a node keeps.
 *
 * Every one is a paid generation and worth keeping, but a node that has been
 * iterated on for months should not carry an unbounded list into every board
 * load. The blobs outlive this — only the reference is trimmed.
 */
export const MAX_HISTORY = 40;

/**
 * What a node has made before this run.
 *
 * Appended to rather than replaced, so altering a prompt adds to the gallery
 * instead of discarding the images the previous prompt produced — they are
 * still in blob storage and still worth looking at. Seeded from whatever shape
 * the node already had, so switching history on does not strand the results
 * that predate it.
 */
export const priorHistoryOf = (
  previous: Record<string, unknown>
): Variation[] => {
  if (Array.isArray(previous.history)) {
    return previous.history as Variation[];
  }
  if (Array.isArray(previous.variations)) {
    return (previous.variations as Variation[]).filter(Boolean);
  }
  return typeof previous.url === "string"
    ? [previous as unknown as Variation]
    : [];
};

export interface Variation {
  description: string | null;
  height: number | null;
  isVector: boolean | null;
  url: string;
  width: number | null;
}

/**
 * The stored shape of an image run, with its history folded in.
 *
 * Pulled out of the handler when results stopped always being images: the two
 * shapes are genuinely different and a single object with half its fields null
 * would have been worse than two.
 */
export const buildImageResult = (
  produced: Extract<Produced, { kind: "image" }>,
  variations: (Variation | undefined)[],
  previous: Record<string, unknown>,
  fingerprint: string
) => {
  // The first filled slot, found by hand: the array is sparse, and the
  // narrowing on find() reads as though the result could never be missing.
  let primaryUrl = produced.url;
  for (const filled of variations) {
    // The first image is what a wire carries downstream: a wire moves one
    // image, so the rest of a batch is for looking at, not for feeding on.
    if (filled) {
      primaryUrl = filled.url;
      break;
    }
  }
  return {
    description: produced.description,
    fingerprint,
    height: produced.height,
    history: [...priorHistoryOf(previous), produced].slice(-MAX_HISTORY),
    isVector: produced.isVector,
    kind: "image" as const,
    ranAt: new Date().toISOString(),
    url: primaryUrl,
    variations,
    width: produced.width,
  };
};

/**
 * What produced this asset, kept legible.
 *
 * db/patches/011_board_graph.sql created `result` to hold the *fingerprint* of
 * the inputs — enough to decide whether a re-run is needed, and useless to a
 * person. This is the same information written down so it can be read, acted on
 * and re-run from: FR-006, and the substrate the Remake action reads.
 *
 * Additive to a JSONB column, so there is no patch and no backfill. An asset
 * made before this existed simply has no stamp, and the canvas says so rather
 * than inventing one.
 */
export interface Provenance {
  at: string;
  brandKitVersionId: string | null;
  /** The URLs actually consumed, after wires and templates resolved. */
  inputs: string[];
  model: string | null;
  /** The prompt as sent, not as typed — an Iterate node rewrites it per run. */
  prompt: string | null;
  recipeVersionId: string | null;
  settings: Record<string, unknown>;
}

export interface ProvenanceInput {
  brandKitVersionId?: string | null;
  inputs: string[];
  model: string | null;
  prompt: string | null;
  recipeVersionId?: string | null;
  settings: Record<string, unknown>;
}

export const stampProvenance = (input: ProvenanceInput): Provenance => ({
  at: new Date().toISOString(),
  brandKitVersionId: input.brandKitVersionId ?? null,
  inputs: input.inputs,
  model: input.model,
  prompt: input.prompt,
  recipeVersionId: input.recipeVersionId ?? null,
  settings: input.settings,
});

/**
 * The stored shape of a run, whichever of the two shapes it came back as.
 *
 * Pulled out of the handler because assembling a result and performing a run
 * are different jobs: the sparse-array bookkeeping below reads better away from
 * the request plumbing, and the handler is left saying only what it does.
 */
export const buildResult = (
  produced: Produced,
  previous: Record<string, unknown>,
  fingerprint: string,
  variation: number,
  jobCount: number,
  provenance: Provenance
): Record<string, unknown> => {
  // Words rather than a picture: an Analyse node's whole output is its text, so
  // there is no batch, no history and nothing to pick between — the variation
  // machinery below simply does not apply to it.
  if (produced.kind === "text") {
    return {
      fingerprint,
      kind: "text",
      provenance,
      ranAt: new Date().toISOString(),
      text: produced.text,
    };
  }

  // Variations accumulate into one result rather than replacing it, so a batch
  // fills in as it goes and a part-finished run still shows what it has. A
  // stale array from an earlier, differently-shaped run is discarded — the
  // fingerprint moving is what says the old images no longer belong.
  //
  // Sparse on purpose: a cancelled and resumed run can fill variation 3 before
  // 1, so the gaps are real and the type says so.
  const kept: (Variation | undefined)[] =
    previous.fingerprint === fingerprint && Array.isArray(previous.variations)
      ? (previous.variations as (Variation | undefined)[]).slice(0, jobCount)
      : [];
  const variations: (Variation | undefined)[] = [...kept];
  variations[variation] = {
    description: produced.description,
    height: produced.height,
    isVector: produced.isVector,
    url: produced.url,
    width: produced.width,
  };
  return {
    ...buildImageResult(produced, variations, previous, fingerprint),
    provenance,
  };
};
