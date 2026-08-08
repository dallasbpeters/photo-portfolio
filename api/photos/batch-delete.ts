import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { parseJsonBody } from "../_lib/parseBody.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const idsRaw = body.photoIds;

  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return res
      .status(400)
      .json({ error: "photoIds must be a non-empty array" });
  }

  const ids = idsRaw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return res.status(400).json({ error: "No valid photo ids" });
  }

  for (const id of ids) {
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: "Invalid photo id" });
    }
  }

  try {
    const sql = getSql();
    const results = (await sql.transaction((txn) =>
      ids.map((id) => txn`DELETE FROM photos WHERE id = ${id} RETURNING id`)
    )) as { id: string }[][];

    const deleted = results.reduce((n, rows) => n + rows.length, 0);

    return res.status(200).json({ deleted });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Batch delete failed" });
  }
}
