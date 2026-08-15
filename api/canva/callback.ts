import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CANVA_REDIRECT_URI } from "../../config/canva.js";
import { exchangeCode, saveTokens } from "../_lib/canva.js";
import { getSql } from "../_lib/db.js";

/**
 * Where Canva sends the browser after the admin approves the connection.
 *
 * The state/verifier pair parked by api/canva/connect is picked up here, the
 * code is exchanged for tokens, and the browser is pointed back at the boards.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";

  // The return path rode along in the state (after the first dot, base64url).
  const dot = state.indexOf(".");
  const returnTo =
    dot > 0
      ? (() => {
          try {
            const path = Buffer.from(
              state.slice(dot + 1),
              "base64url"
            ).toString("utf8");
            return path.startsWith("/") ? path : "/admin/boards";
          } catch {
            return "/admin/boards";
          }
        })()
      : "/admin/boards";
  const back = `${returnTo}?canva=error`;
  if (!(state && code)) {
    return res.redirect(back);
  }

  const sql = getSql();
  const pending = (await sql`
    SELECT user_id, code_verifier FROM canva_oauth_states
    WHERE state = ${state} LIMIT 1
  `) as { code_verifier: string; user_id: string }[];

  if (pending.length === 0) {
    return res.redirect(back);
  }
  const { code_verifier: verifier, user_id: userId } = pending[0];
  // One-time state: consumed whether the exchange succeeds or not.
  await sql`DELETE FROM canva_oauth_states WHERE state = ${state}`;

  try {
    const tokens = await exchangeCode(code, verifier, CANVA_REDIRECT_URI);
    await saveTokens(sql, userId, tokens);
    return res.redirect(`${returnTo}?canva=connected`);
  } catch (error) {
    // The exchange is the one step that can fail for a reason invisible to the
    // browser (bad client secret, unregistered redirect, expired code), so the
    // reason is logged here rather than lost behind the error redirect.
    console.error(
      "Canva token exchange failed:",
      error instanceof Error ? error.message : error
    );
    return res.redirect(back);
  }
}
