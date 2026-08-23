import { randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { authorizeUrl, pkcePair } from "../_lib/lightroom.js";
import {
  isConfigured,
  loadCredentials,
  missingHalf,
} from "../_lib/lightroomConfig.js";

/**
 * Starts the Adobe handshake: parks a state/verifier pair, then hands back the
 * consent URL. api/lightroom/callback picks the verifier up when the browser
 * returns.
 *
 * The state carries where to land afterwards, base64url'd behind a random
 * prefix, so connecting from the photos screen returns to the photos screen.
 * The same construction Canva's connect uses, and the reason the callback can
 * redirect somewhere useful without a second round trip.
 */
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
  const credentials = await loadCredentials(sql);
  if (!isConfigured(credentials)) {
    return res.status(503).json({
      error: `Lightroom needs ${missingHalf(credentials)} — enter it under Lightroom in the admin.`,
    });
  }

  const rawReturn = req.query.returnTo;
  const returnTo =
    typeof rawReturn === "string" && rawReturn.startsWith("/")
      ? rawReturn
      : "/admin/lightroom";
  const state = `${randomBytes(24).toString("base64url")}.${Buffer.from(returnTo).toString("base64url")}`;
  const { challenge, verifier } = pkcePair();

  await sql`
    INSERT INTO lightroom_oauth_states (state, user_id, code_verifier)
    VALUES (${state}, ${user.userId}, ${verifier})
  `;

  return res.status(200).json({
    // Echoed back so the panel can show exactly what must be registered at
    // Adobe. A mismatch here is the most common cause of a failed handshake and
    // Adobe's error does not say which part disagreed.
    redirectUri: credentials.redirectUri,
    url: authorizeUrl(credentials, state, challenge),
  });
}
