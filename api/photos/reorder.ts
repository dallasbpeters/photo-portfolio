import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { parseJsonBody } from "../_lib/parseBody.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The same ceiling the library itself is bounded by elsewhere. */
const MAX_IDS = 500;

/**
 * Rewrites the order of a set of photographs.
 *
 * The body is the ids in the order they should end up, and only those
 * photographs move. That matters because `sort_order` is one sequence across
 * the whole library while the admin drags within a single category: writing
 * 0..n over the dragged set would rip that category out of the middle of the
 * sequence and stack it at the front, silently reordering every other category
 * around it.
 *
 * So the photographs are permuted through the positions they already occupy.
 * The set of sort_order values held by the dragged photographs is collected,
 * sorted, and handed back out in the new order — every other photograph keeps
 * the position it had, and the categories stay interleaved exactly as before.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = parseJsonBody(req.body);
  const raw = Array.isArray(body.photoIds) ? body.photoIds : null;
  if (!raw) {
    return res.status(400).json({ error: "photoIds must be an array" });
  }
  if (raw.length > MAX_IDS) {
    return res
      .status(400)
      .json({ error: `Cannot reorder more than ${MAX_IDS} at once` });
  }

  const ids = raw.filter(
    (id): id is string => typeof id === "string" && UUID_RE.test(id)
  );
  // A malformed id would shift every photograph after it into the wrong slot,
  // so a partial list is refused rather than applied.
  if (ids.length !== raw.length) {
    return res.status(400).json({ error: "photoIds contains an invalid id" });
  }
  if (new Set(ids).size !== ids.length) {
    return res.status(400).json({ error: "photoIds contains a duplicate" });
  }
  if (ids.length === 0) {
    return res.status(200).json({ reordered: 0 });
  }

  try {
    const sql = getSql();
    await sql`
      WITH wanted AS (
        SELECT t.id, t.pos
        FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS t(id, pos)
      ),
      slots AS (
        SELECT
          sort_order,
          row_number() OVER (ORDER BY sort_order ASC, created_at ASC) AS pos
        FROM photos
        WHERE id = ANY(${ids}::uuid[])
      )
      UPDATE photos p
      SET sort_order = slots.sort_order
      FROM wanted
      JOIN slots ON slots.pos = wanted.pos
      WHERE p.id = wanted.id
    `;

    return res.status(200).json({ reordered: ids.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not reorder photos" });
  }
}
