import { parsePublicHttpUrl } from "../../../_lib/httpUrl.js";
import { HTTP_SCHEME } from "./refusals.js";

/**
 * What a capability that only the browser can perform hands back.
 *
 * Composite and shader do no work here at all: the browser drew the picture,
 * uploaded it, and wrote the address onto the node, so this reads it back and
 * checks it is an address worth trusting. Kept apart from capabilities.ts
 * because everything else in that file reaches for sharp, fal or the database
 * and cannot be loaded — or tested — without them. The return shape is written
 * out here rather than imported back from capabilities for the same reason: a
 * type-only import still names the module, and naming it is enough to drag all
 * of that into a test that needs none of it.
 */

/** Structurally the image half of capabilities.ts's `Produced`. */
export interface RenderedImage {
  description: string | null;
  height: number | null;
  isVector: boolean | null;
  kind: "image";
  url: string;
  width: number | null;
}

/**
 * A picture the browser made, read back off the node.
 *
 * Two capabilities work this way and neither does anything here: a composite
 * needs the board's geometry and a shader needs a GPU, so both are rendered in
 * the browser, uploaded, and the URL left on the node for the run to store. What
 * this returns is what gives the node a result, a history and a thumbnail — and
 * what lets anything downstream read it through `result.url`.
 *
 * The URL is validated like any other that leaves here. The canvas only ever
 * writes our own blob storage into it, but the value arrives through a board
 * save, and a saved board is caller-supplied data.
 */
export const browserRendered = (
  config: Record<string, unknown>,
  key: string,
  missing: string,
  /**
   * Which of the browser's renders this run wants.
   *
   * A shader fans out into one variation per wired picture, and the browser
   * draws one file for each. Reading a single URL handed the same picture back
   * for every variation of a batch, so a Batch of ten came out as ten copies of
   * the first.
   */
  variation = 0,
  listKey?: string
): RenderedImage => {
  const list = listKey ? config[listKey] : undefined;
  const drawn = Array.isArray(list) ? list.filter(Boolean).length : 0;
  const nth = Array.isArray(list) ? list[variation] : undefined;
  // The single key is the fallback, for a board saved before batches and for
  // the first variation of one.
  const raw = nth ?? (variation === 0 ? config[key] : undefined);
  const url =
    typeof raw === "string" && HTTP_SCHEME.test(raw)
      ? parsePublicHttpUrl(raw)
      : null;
  if (!url) {
    /*
     * Say what was actually found.
     *
     * This half of the run is performed by the browser and this half checks it,
     * so when the two disagree the only useful thing to report is the shape of
     * the disagreement: which picture was wanted and how many were drawn. "Not
     * rendered yet" on its own is true of a browser that drew nothing, a
     * browser that drew fewer than the run expected, and a save that dropped
     * them on the way — three different faults wearing one message, which is
     * how a batch of twenty-two came back with nothing useful to go on.
     */
    throw new Error(
      Array.isArray(list)
        ? `${missing}: the run wants picture ${variation + 1} and ${drawn} of ${list.length} were drawn.`
        : `${missing}: the run wants picture ${variation + 1} and none were drawn.`
    );
  }
  return {
    description: null,
    height: null,
    isVector: null,
    kind: "image",
    url,
    width: null,
  };
};
