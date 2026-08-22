import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { connectionFor } from "../_lib/lightroom.js";
import { fetchAccount } from "../_lib/lightroomCatalog.js";
import {
  isLightroomConfigured,
  lightroomMissingEnv,
} from "../_lib/lightroomEnv.js";

/**
 * Whether Lightroom can be used right now, and by whom.
 *
 * Three separate answers rather than one boolean, because the fixes are
 * different and the panel has to say which is needed: `configured` is an env var
 * on the deployment, `connected` is an OAuth handshake the admin performs, and
 * `entitled` is whether the Adobe account they connected actually has a
 * Lightroom subscription. An account can be connected and unentitled, which
 * authorises perfectly and then 403s on every picture.
 *
 * The entitlement check costs a round trip to Adobe, so it is only made when
 * there is a connection to check.
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

  const configured = isLightroomConfigured();
  if (!configured) {
    return res.status(200).json({
      configured: false,
      connected: false,
      missingEnv: lightroomMissingEnv(),
    });
  }

  try {
    const connection = await connectionFor(getSql(), user.userId);
    if (!connection) {
      return res.status(200).json({ configured: true, connected: false });
    }
    const account = await fetchAccount(connection);
    return res.status(200).json({
      accountEmail: account.email ?? connection.accountEmail,
      catalogId: connection.catalogId,
      configured: true,
      connected: true,
      entitled: account.entitled,
    });
  } catch (e) {
    // A refresh that failed, a revoked grant, or Adobe being down. Reported as
    // a reachable-but-broken connection rather than as "not connected", so the
    // panel offers reconnecting and says why.
    return res.status(200).json({
      configured: true,
      connected: true,
      entitled: false,
      error: e instanceof Error ? e.message : "Could not reach Lightroom",
    });
  }
}
