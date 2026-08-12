import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../../_lib/auth.js";
import { handleCors } from "../../_lib/cors.js";
import { getSql } from "../../_lib/db.js";
import { parseJsonBody } from "../../_lib/parseBody.js";

/**
 * Removes one version from a node's history.
 *
 * Its own endpoint rather than part of saving the board, because `result` is
 * not the canvas's to write. The board save deliberately leaves that column
 * alone: a debounced autosave carrying a pre-run copy would otherwise land
 * after a generation finished and erase an image that had just been paid for.
 * Deleting a version is the one case where the canvas genuinely does mean to
 * change a result, so it says so explicitly, here.
 *
 * `selectedVersion` is not touched. That lives in `config`, which the canvas
 * does own, so the client adjusts it — mixing the two here would reintroduce
 * exactly the race the split exists to prevent.
 */

interface StoredResult {
  history?: { url?: string }[];
  url?: string;
  variations?: unknown[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!getBearerUser(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const raw = req.query.id;
  const boardId = Array.isArray(raw) ? raw[0] : raw;
  const body = parseJsonBody(req) as { index?: unknown; itemId?: unknown };
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const index = Number(body.index);
  const hasTarget = Boolean(boardId && itemId);
  if (!(hasTarget && Number.isInteger(index) && index >= 0)) {
    return res
      .status(400)
      .json({ error: "An item and a version are required" });
  }

  const sql = getSql();
  const rows = (await sql`
    SELECT result FROM board_items
    WHERE id = ${itemId} AND board_id = ${boardId}
  `) as { result: unknown }[];

  const stored = rows[0]?.result as StoredResult | null;
  const history = Array.isArray(stored?.history) ? stored.history : [];
  if (!stored || index >= history.length) {
    return res.status(404).json({ error: "No such version" });
  }

  const kept = history.filter((_, i) => i !== index);
  // The last one going means the node has produced nothing, which is a null
  // result rather than a result holding an empty list — that is the shape the
  // rest of the code already reads as "never run".
  const result =
    kept.length === 0
      ? null
      : {
          ...stored,
          history: kept,
          // What a wire carries is the first surviving image, so a deleted
          // version cannot go on feeding the node downstream of it.
          url: kept[0]?.url ?? null,
          // The batch grid is a view of one run; once a version has been
          // removed by hand it no longer describes anything.
          variations: undefined,
        };

  await sql`
    UPDATE board_items
    SET result = ${result === null ? null : JSON.stringify(result)}::jsonb
    WHERE id = ${itemId} AND board_id = ${boardId}
  `;

  return res.status(200).json({ count: kept.length, result });
}
