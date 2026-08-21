import type { ElementStyle } from "../../../_lib/elementStyle.js";
import { inputFingerprint } from "../../../_lib/fingerprint.js";
import type { RunnableItem } from "./inputs.js";

/**
 * What a re-run compares against.
 *
 * A node whose settings and inputs have not moved has already been paid for,
 * and running it again would buy the same picture twice. This is the single
 * value that decides it — see db/patches/011_board_graph.sql, which created
 * `result` to hold it.
 */

/**
 * What this node's settings and inputs come to, as the single value the stored
 * fingerprint is compared against.
 */
export const fingerprintFor = (
  item: RunnableItem,
  values: Record<string, string[] | undefined>,
  element: ElementStyle
): Promise<string> =>
  inputFingerprint({
    // The wired elements' words and pictures count as settings for this
    // purpose: they decide what is sent, so a style corrected in the library —
    // a reworded description, a reference added or removed — has to make the
    // nodes using it stale or the correction would never reach a picture.
    // Folded in only when there is an element, so no fingerprint on a board
    // without one moves and finished work is not offered up for re-running.
    config:
      element.words.length > 0 || element.images.length > 0
        ? {
            ...item.config,
            element: element.words,
            elementImages: element.images,
          }
        : item.config,
    // Joined per port: the fingerprint only has to change when the inputs do,
    // and a stable string does that as well as an array while keeping the
    // canonical form simple.
    inputs: Object.fromEntries(
      Object.entries(values).map(([key, list]) => [
        key,
        (list ?? []).join("\u0000"),
      ])
    ),
    nodeType: item.nodeType,
  });
