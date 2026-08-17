import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../../_lib/auth.js";
import { handleCors } from "../../_lib/cors.js";
import { getSql } from "../../_lib/db.js";
import { parsePublicHttpUrl } from "../../_lib/httpUrl.js";
import { parseJsonBody } from "../../_lib/parseBody.js";

/**
 * Keeps what a tool made.
 *
 * A tool ran, uploaded its output, wrote it onto the item — and it was gone on
 * reload, because a board save deliberately never writes `result`: the save
 * replaces the whole arrangement on a debounce, so one in flight when a
 * generation landed would put the pre-run copy back and destroy work that cost
 * money. See the note in api/_lib/boards.ts.
 *
 * So `result` is written here instead, one item at a time — the same division
 * api/boards/[id]/svg.ts already uses, and for the same reason.
 *
 * The caller sends the *variation*, not a result object. Handing the client a
 * whole JSONB blob to store would mean trusting its shape, its size and its
 * history; sending one picture and building the result here means the append
 * rule, the cap and the kind are decided in one place — the same place the SVG
 * write-back and the video collector decide them.
 */

/** Mirrors run.ts and svg.ts, so no path can grow a history without bound. */
const MAX_HISTORY = 40;

interface Variation {
  description: string | null;
  height: number | null;
  isVector: boolean | null;
  /** "video" marks a clip, so the canvas renders it as one. */
  kind?: string;
  url: string;
  width: number | null;
}

interface StoredResult {
  history?: unknown[];
  kind?: string;
  url?: string;
}

/** A finite number, or null. Width and height are advisory, never trusted. */
const size = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!getBearerUser(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const raw = req.query.id;
  const boardId = Array.isArray(raw) ? raw[0] : raw;
  const body = parseJsonBody(req.body) as Record<string, unknown>;
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  // Checked rather than taken: this is stored and later handed to a browser and
  // to fal as a source image, so a "javascript:" or a file path must not
  // survive the trip.
  const url =
    typeof body.url === "string" ? parsePublicHttpUrl(body.url.trim()) : null;

  if (!(boardId && itemId)) {
    return res.status(400).json({ error: "An item is required" });
  }
  if (!url) {
    return res
      .status(400)
      .json({ error: "The result must be a public http(s) URL" });
  }

  const sql = getSql();
  const rows = (await sql`
    SELECT result FROM board_items
    WHERE id = ${itemId} AND board_id = ${boardId}
  `) as { result: unknown }[];
  if (rows.length === 0) {
    // Not found rather than created: a result belongs to an item, and writing
    // one for an id that is not on this board would be someone else's row.
    return res.status(404).json({ error: "Item not found on this board" });
  }
  const stored = (rows[0]?.result ?? null) as StoredResult | null;

  const kind = body.kind === "video" ? "video" : "image";
  const variation: Variation = {
    description:
      typeof body.description === "string"
        ? body.description.slice(0, 2000)
        : null,
    height: size(body.height),
    isVector: body.isVector === true,
    ...(kind === "video" ? { kind } : {}),
    url,
    width: size(body.width),
  };

  const history = Array.isArray(stored?.history) ? stored.history : [];
  const result = {
    ...stored,
    history: [...history, variation].slice(-MAX_HISTORY),
    kind,
    // The newest picture is what the item shows and what a wire carries on.
    url,
    variations: [variation],
  };

  await sql`
    UPDATE board_items
    SET result = ${JSON.stringify(result)}::jsonb,
        run_state = 'succeeded',
        run_error = NULL
    WHERE id = ${itemId} AND board_id = ${boardId}
  `;
  return res.status(200).json({ result });
}
