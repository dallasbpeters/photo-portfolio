import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { forgetTokens } from "../_lib/lightroom.js";
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from "../_lib/lightroomConfig.js";
import { parseJsonBody } from "../_lib/parseBody.js";

/**
 * The Adobe integration's own credentials, entered here rather than deployed.
 *
 * **The secret is write-only.** It goes in and is never read back — the GET
 * reports whether one is stored, not what it is. That is not decoration: an
 * admin session is the only thing between this endpoint and an OAuth client
 * secret, and a secret that is never returned cannot leak through a screen
 * share, a browser cache, or a logged response body. It also means the panel
 * cannot send the stored value back, which is why an empty secret field means
 * "keep what you have" rather than "clear it" — see saveCredentials.
 *
 * The client id *is* returned. It is not a secret: it travels in the authorize
 * URL in plain sight and as the X-API-Key header on every request, and the panel
 * needs it to say which integration is configured.
 */

/** A submitted field: trimmed, bounded, or undefined when not sent. */
const field = (
  body: Record<string, unknown>,
  key: string,
  max: number
): string | undefined => {
  const raw = body[key];
  if (typeof raw !== "string") {
    return;
  }
  const clean = raw.trim().slice(0, max);
  // An empty string means "not sent" here rather than "clear this". Clearing is
  // DELETE, which is a deliberate act rather than a side effect of saving a form
  // with one field filled in.
  return clean === "" ? undefined : clean;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const sql = getSql();

  if (req.method === "GET") {
    const credentials = await loadCredentials(sql);
    return res.status(200).json({
      clientId: credentials.clientId,
      hasSecret: Boolean(credentials.clientSecret),
      redirectUri: credentials.redirectUri,
      redirectUriSource: credentials.redirectUriSource,
      source: credentials.source,
    });
  }

  if (req.method === "PUT") {
    const body = parseJsonBody(req.body) as Record<string, unknown>;
    // Adobe's ids and secrets are short; the URI is a URL. Bounded so a
    // pasted page of text cannot become a row.
    const next = {
      clientId: field(body, "clientId", 200),
      clientSecret: field(body, "clientSecret", 400),
      redirectUri: field(body, "redirectUri", 500),
    };
    if (!(next.clientId || next.clientSecret || next.redirectUri)) {
      return res.status(400).json({ error: "Nothing to save" });
    }

    /*
     * A changed client id invalidates every stored token.
     *
     * The tokens were issued to the old integration, so they will not work with
     * the new one and the failure — a 403 on every request — says nothing about
     * why. Dropping them makes the panel show "not connected", which is both
     * true and actionable.
     */
    const before = await loadCredentials(sql);
    await saveCredentials(sql, user.userId, next);
    const after = await loadCredentials(sql);
    if (before.clientId && after.clientId !== before.clientId) {
      await forgetTokens(sql, user.userId);
    }

    return res.status(200).json({
      clientId: after.clientId,
      hasSecret: Boolean(after.clientSecret),
      redirectUri: after.redirectUri,
      redirectUriSource: after.redirectUriSource,
      source: after.source,
    });
  }

  if (req.method === "DELETE") {
    // The tokens go too: they belong to the integration being forgotten, and
    // leaving them would show a connection that cannot be used.
    await clearCredentials(sql);
    await forgetTokens(sql, user.userId);
    return res.status(204).end();
  }

  res.setHeader("Allow", "GET, PUT, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
