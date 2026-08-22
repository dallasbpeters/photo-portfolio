import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { forgetTokens } from "../_lib/lightroom.js";

/**
 * Forgets the stored tokens.
 *
 * Only ours — this cannot revoke the grant at Adobe's end, which is done from
 * the Adobe account page. The panel says so, because "disconnect" that leaves a
 * live grant behind is a promise not kept.
 *
 * Deliberately does not touch lightroom_assets. What was imported stays
 * imported, and the record of it is what stops a reconnect offering the same
 * pictures again.
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
  await forgetTokens(getSql(), user.userId);
  return res.status(204).end();
}
