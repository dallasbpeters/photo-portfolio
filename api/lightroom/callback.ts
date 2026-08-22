import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSql } from "../_lib/db.js";
import { exchangeCode, saveTokens } from "../_lib/lightroom.js";
import { fetchAccount, fetchCatalogId } from "../_lib/lightroomCatalog.js";

/**
 * Where Adobe sends the browser after the admin approves the connection.
 *
 * The state/verifier pair parked by api/lightroom/connect is picked up here, the
 * code is exchanged, and the catalogue id and account email are fetched once and
 * cached on the token row — every later request needs the catalogue id in its
 * path, and asking Adobe for it on each one would be a round trip to learn
 * something that never changes.
 *
 * Those two extra calls are deliberately not fatal. A token that exchanged
 * successfully is a working connection, and losing it because the account
 * endpoint hiccuped would send the admin back through consent for nothing — so
 * a failure there stores the token anyway and lets the status route discover the
 * catalogue later.
 */

/** The return path rode along in the state, base64url after the first dot. */
const returnPathOf = (state: string): string => {
  const dot = state.indexOf(".");
  if (dot <= 0) {
    return "/admin/lightroom";
  }
  try {
    const path = Buffer.from(state.slice(dot + 1), "base64url").toString(
      "utf8"
    );
    return path.startsWith("/") ? path : "/admin/lightroom";
  } catch {
    return "/admin/lightroom";
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const returnTo = returnPathOf(state);
  const back = `${returnTo}?lightroom=error`;

  /*
   * A refused consent comes back as `error=access_denied` with no code, which
   * is not a failure worth a scary message — somebody pressed Cancel. Told
   * apart from a real error so the panel can stay quiet about it.
   */
  if (typeof req.query.error === "string" && req.query.error) {
    const denied = req.query.error === "access_denied";
    return res.redirect(
      `${returnTo}?lightroom=${denied ? "cancelled" : "error"}`
    );
  }
  if (!(state && code)) {
    return res.redirect(back);
  }

  const sql = getSql();
  const pending = (await sql`
    SELECT user_id, code_verifier FROM lightroom_oauth_states
    WHERE state = ${state} LIMIT 1
  `) as { code_verifier: string; user_id: string }[];

  if (pending.length === 0) {
    return res.redirect(back);
  }
  const { code_verifier: verifier, user_id: userId } = pending[0];
  // One-time state: consumed whether the exchange succeeds or not.
  await sql`DELETE FROM lightroom_oauth_states WHERE state = ${state}`;

  let tokens: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    tokens = await exchangeCode(code, verifier);
  } catch (error) {
    // The one step that fails for reasons invisible to the browser: a wrong
    // secret, an unregistered redirect, a scope the integration is not entitled
    // to. Logged here rather than lost behind the redirect.
    console.error(
      "Adobe token exchange failed:",
      error instanceof Error ? error.message : error
    );
    return res.redirect(back);
  }

  // Best-effort enrichment. See the note above on why this cannot fail the
  // connection.
  let catalogId: string | null = null;
  let accountEmail: string | null = null;
  try {
    const connection = {
      accessToken: tokens.accessToken,
      accountEmail: null,
      catalogId: null,
    };
    accountEmail = (await fetchAccount(connection)).email;
    catalogId = await fetchCatalogId(connection);
  } catch (error) {
    console.error(
      "Lightroom connected, but the catalogue lookup failed:",
      error instanceof Error ? error.message : error
    );
  }

  await saveTokens(sql, userId, tokens, { accountEmail, catalogId });

  /*
   * Said in the redirect, because it changes what the panel can offer.
   *
   * Without `offline_access` the connection lasts a day and cannot renew — the
   * integration still works, but "reconnect tomorrow" is something to know now
   * rather than discover when an import fails.
   */
  const durable = tokens.refreshToken ? "connected" : "connected-temporary";
  return res.redirect(`${returnTo}?lightroom=${durable}`);
}
