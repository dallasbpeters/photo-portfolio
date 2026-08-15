import { randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  CANVA_CLIENT_SECRET,
  CANVA_REDIRECT_URI,
  isCanvaConfigured,
} from "../../config/canva.js";
import { getBearerUser } from "../_lib/auth.js";
import { authorizeUrl, pkcePair } from "../_lib/canva.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";

/**
 * Starts the Canva OAuth handshake: parks a state/verifier pair, then sends
 * the browser to Canva's consent screen. The callback (api/canva/callback)
 * picks the verifier back up when the user returns.
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
  if (!isCanvaConfigured()) {
    const missing = CANVA_CLIENT_SECRET
      ? "CANVA_CLIENT_ID"
      : "CANVA_CLIENT_SECRET";
    return res.status(503).json({
      error: `Canva is not configured — set ${missing} (the token exchange requires the client secret).`,
    });
  }

  // The state carries where the browser should land after the handshake, so a
  // send from a board returns to that board rather than to the board list.
  const rawReturn = req.query.returnTo;
  const returnTo =
    typeof rawReturn === "string" && rawReturn.startsWith("/")
      ? rawReturn
      : "/admin/boards";
  const state = `${randomBytes(24).toString("base64url")}.${Buffer.from(returnTo).toString("base64url")}`;
  const { challenge, verifier } = pkcePair();
  await getSql()`
    INSERT INTO canva_oauth_states (state, user_id, code_verifier)
    VALUES (${state}, ${user.userId}, ${verifier})
  `;

  return res.status(200).json({
    redirectUri: CANVA_REDIRECT_URI,
    url: authorizeUrl(state, challenge),
  });
}
