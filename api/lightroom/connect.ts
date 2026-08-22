import { randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { authorizeUrl, pkcePair } from "../_lib/lightroom.js";
import {
  adobeRedirectUri,
  isLightroomConfigured,
  lightroomMissingEnv,
} from "../_lib/lightroomEnv.js";

/**
 * Starts the Adobe handshake: parks a state/verifier pair, then hands back the
 * consent URL. api/lightroom/callback picks the verifier up when the browser
 * returns.
 *
 * The state carries where to land afterwards, base64url'd behind a random
 * prefix, so connecting from the photos screen returns to the photos screen.
 * The same construction Canva's connect uses, and it is the reason the callback
 * can redirect somewhere useful without a second round trip.
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
  if (!isLightroomConfigured()) {
    return res.status(503).json({
      error: `Lightroom is not configured — set ${lightroomMissingEnv()} on the project. The token exchange needs the client secret, so the id alone is not enough.`,
    });
  }

  const rawReturn = req.query.returnTo;
  const returnTo =
    typeof rawReturn === "string" && rawReturn.startsWith("/")
      ? rawReturn
      : "/admin/lightroom";
  const state = `${randomBytes(24).toString("base64url")}.${Buffer.from(returnTo).toString("base64url")}`;
  const { challenge, verifier } = pkcePair();

  await getSql()`
    INSERT INTO lightroom_oauth_states (state, user_id, code_verifier)
    VALUES (${state}, ${user.userId}, ${verifier})
  `;

  return res.status(200).json({
    redirectUri: adobeRedirectUri(),
    url: authorizeUrl(state, challenge),
  });
}
