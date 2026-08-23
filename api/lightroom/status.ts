import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { connectionFor } from "../_lib/lightroom.js";
import { fetchAccount } from "../_lib/lightroomCatalog.js";
import {
  isConfigured,
  loadCredentials,
  missingHalf,
} from "../_lib/lightroomConfig.js";

/**
 * Whether Lightroom can be used right now, and by whom.
 *
 * Four separate answers rather than one boolean, because the fixes are
 * different and the panel has to say which is needed: `configured` is a
 * credential somebody enters, `connected` is an OAuth handshake they perform,
 * `entitled` is whether the Adobe account they connected has a Lightroom
 * subscription, and `error` is a connection that exists and has stopped
 * working. An account can be connected and unentitled, which authorises
 * perfectly and then 403s on every picture.
 *
 * The entitlement check costs a round trip to Adobe, so it is only made when
 * there is a connection to check.
 *
 * The client id is returned and the secret never is. The id is not a secret —
 * it travels in the authorize URL in plain sight — and the panel needs it to
 * show which integration is configured.
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
  const base = {
    clientId: credentials.clientId,
    hasSecret: Boolean(credentials.clientSecret),
    redirectUri: credentials.redirectUri,
    redirectUriSource: credentials.redirectUriSource,
    source: credentials.source,
  };

  if (!isConfigured(credentials)) {
    return res.status(200).json({
      ...base,
      configured: false,
      connected: false,
      missing: missingHalf(credentials),
    });
  }

  try {
    const connection = await connectionFor(sql, user.userId);
    if (!connection) {
      return res
        .status(200)
        .json({ ...base, configured: true, connected: false });
    }
    const account = await fetchAccount(connection);
    return res.status(200).json({
      ...base,
      accountEmail: account.email ?? connection.accountEmail,
      catalogId: connection.catalogId,
      configured: true,
      connected: true,
      entitled: account.entitled,
    });
  } catch (e) {
    // A refresh that failed, a revoked grant, a wrong secret, or Adobe being
    // down. Reported as reachable-but-broken rather than "not connected", so
    // the panel offers reconnecting and says why.
    return res.status(200).json({
      ...base,
      configured: true,
      connected: true,
      entitled: false,
      error: e instanceof Error ? e.message : "Could not reach Lightroom",
    });
  }
}
