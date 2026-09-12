import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "./_lib/auth.js";
import { claudeToken, federationConfig } from "./_lib/claudeAuth.js";
import { tokenFromHeaders } from "./_lib/claudeTokenState.js";
import { handleCors } from "./_lib/cors.js";

/**
 * Whether this deployment can reach Claude without a key.
 *
 * Federation has five ways to be almost right — the issuer registered under a
 * different URL than the one signing the tokens, a rule whose subject pattern
 * is an exact match where a prefix was meant, an audience left at Anthropic's
 * default when the token carries the platform's own, an environment claim that
 * excludes the deployment asking, a workspace the service account is not a
 * member of — and every one of them surfaces at the call site as "auth
 * failed". None of them is visible from a code path that only runs when
 * somebody generates a picture.
 *
 * So the exchange gets a door of its own. It reports what is configured, what
 * the identity token says about itself, and whether the trade succeeded — and
 * it is deliberately the *only* place any of that is assembled, because a
 * diagnostic that reimplements the thing it diagnoses proves nothing.
 *
 * Admin-only. The claims name the project and the team, which is not secret
 * but is nobody else's business, and an open endpoint that mints tokens on
 * request is an open endpoint that mints tokens on request.
 */

/** The claims worth reporting, read without verifying — that is Anthropic's job. */
const claimsOf = (jwt: string): Record<string, unknown> | null => {
  const [, payload] = jwt.split(".");
  if (!payload) {
    return null;
  }
  try {
    return JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (!getBearerUser(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const federation = federationConfig();
  const assertion = tokenFromHeaders(
    req.headers,
    process.env.VERCEL_OIDC_TOKEN ?? ""
  );
  const claims = assertion ? claimsOf(assertion) : null;

  /*
   * What the token says about itself, echoed back.
   *
   * These four are exactly the fields a rule matches on, so seeing them beside
   * a failure is usually the whole diagnosis: a subject that does not start
   * where the pattern says, an environment the rule excludes, an audience that
   * is the platform's rather than Anthropic's.
   */
  const identity = claims
    ? {
        aud: claims.aud,
        environment: claims.environment,
        iss: claims.iss,
        project: claims.project,
        sub: claims.sub,
      }
    : null;

  if (!federation) {
    return res.status(200).json({
      configured: false,
      identity,
      reason:
        "Set ANTHROPIC_ORGANIZATION_ID, ANTHROPIC_FEDERATION_RULE_ID and ANTHROPIC_SERVICE_ACCOUNT_ID.",
    });
  }

  try {
    const token = await claudeToken(req.headers);
    return res.status(200).json({
      configured: true,
      exchanged: Boolean(token),
      identity,
    });
  } catch (e) {
    // The reason, verbatim. Anthropic's body names which check failed, and
    // paraphrasing it here would throw away the only useful part.
    return res.status(200).json({
      configured: true,
      exchanged: false,
      identity,
      reason: e instanceof Error ? e.message : String(e),
    });
  }
}
