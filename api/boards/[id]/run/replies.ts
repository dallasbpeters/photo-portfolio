import type { NodeCapability } from "../../../../config/nodeTypes.js";
import type { getSql } from "../../../_lib/db.js";
import type { Job } from "../../../_lib/elementStyle.js";
import type { RunnableItem } from "./inputs.js";
import type { Refusal } from "./refusals.js";

export type Sql = ReturnType<typeof getSql>;

/**
 * What the run endpoint sends back, and how a node's state is recorded.
 *
 * `Prepared` is the shape everything before the third-party call returns: either
 * a response to send as-is, or everything the run needs. Keeping it here lets
 * each refusal read as one flat check in run/refusals.ts rather than another
 * level of nesting in the handler.
 */

/** Either a response to send as-is, or everything the run needs. */
export type Prepared =
  | {
      body: Record<string, unknown>;
      ready: null;
      /** The reason to write to `run_error`, or null to leave the node alone. */
      record: string | null;
      status: number;
    }
  | {
      body: null;
      ready: {
        capability: NodeCapability;
        fingerprint: string;
        item: RunnableItem;
        /** One entry per variation: the image it reworks and the prompt used. */
        jobs: Job[];
        model: string | null;
        prompt: string;
        /** Wired images that could not be read (unfetchable addresses), so did not run. */
        skippedVectors: number;
        /** Every wired image, for the capability that reads them together. */
        sourceImageUrls: string[];
      };
      record: null;
      status: null;
    };

/**
 * A refusal the node keeps: the reason is written to `run_error` before the
 * response is sent.
 *
 * Pre-flight refusals used to return 422 and touch nothing, so a node that
 * could never run looked — to anything reading `board_items` — exactly like one
 * that had simply never been asked to. Diagnosis went: query for errors, find
 * none, conclude the board is healthy, be wrong. The reason now outlives the
 * toast, survives a reload, and answers the one query worth asking.
 */
export const refuse = (status: number, body: Refusal): Prepared => ({
  body,
  ready: null,
  record: body.error,
  status,
});

/**
 * A response the node does not keep: sent as-is, with nothing written to
 * `run_error`.
 *
 * A run that is skipped because its stored result is still current has
 * succeeded, and recording a reason against a node that is perfectly well would
 * be the opposite of what `record` is for.
 */
export const reply = (
  status: number,
  body: Record<string, unknown>
): Prepared => ({
  body,
  ready: null,
  record: null,
  status,
});

export const setRunning = (sql: Sql, itemId: string) =>
  sql`
    UPDATE board_items
    SET run_state = 'running', run_error = NULL
    WHERE id = ${itemId}
  `;

export const saveFailure = (sql: Sql, itemId: string, message: string) =>
  sql`
    UPDATE board_items
    SET run_state = 'failed', run_error = ${message}
    WHERE id = ${itemId}
  `;
