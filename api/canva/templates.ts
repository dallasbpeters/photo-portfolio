import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { listBrandTemplates, usableToken } from "../_lib/canva.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";

/** The admin's autofillable Canva brand templates. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const sql = getSql();
  const token = await usableToken(sql, user.userId);
  if (!token) {
    return res.status(401).json({ error: "Connect your Canva account first" });
  }
  try {
    const templates = await listBrandTemplates(token);
    return res.status(200).json({ templates });
  } catch (err) {
    return res
      .status(502)
      .json({ error: err instanceof Error ? err.message : "Canva failed" });
  }
}
