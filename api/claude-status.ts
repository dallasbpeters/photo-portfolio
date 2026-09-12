import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "./_lib/auth.js";
import { claudeToken, federationConfig } from "./_lib/claudeAuth.js";
import { tokenFromHeaders } from "./_lib/claudeTokenState.js";
import { handleCors } from "./_lib/cors.js";
import { withRequestIdentity } from "./_lib/requestIdentity.js";

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

const report = async (req: VercelRequest, res: VercelResponse) => {
  if (handleCors(req, res)) {
    return;
  }
  if (!getBearerUser(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const federation = federationConfig();
  // Fingerprints only. The ids are not secrets, but echoing them whole makes
  // a screenshot of this page a copy of the configuration.
  const configuredAs = federation
    ? {
        organizationId: `${federation.organizationId.slice(0, 8)}…`,
        ruleId: `${federation.ruleId.slice(0, 12)}…`,
        serviceAccountId: `${federation.serviceAccountId.slice(0, 12)}…`,
        workspaceId: federation.workspaceId
          ? `${federation.workspaceId.slice(0, 12)}…`
          : null,
      }
    : null;
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
  const now = Math.floor(Date.now() / 1000);
  const identity = claims
    ? {
        aud: claims.aud,
        environment: claims.environment,
        /*
         * How long this token has left, and whether it can be replayed.
         *
         * Both are causes a 401 will not name. An expired assertion is
         * refused exactly like a rule that did not match, and a `jti` is
         * single-use by default — so a platform that hands the same token to
         * several invocations succeeds once and then fails forever, which
         * reads as "it worked and then it broke".
         */
        expiresInSeconds:
          typeof claims.exp === "number" ? claims.exp - now : null,
        hasJti: Boolean(claims.jti),
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
    const token = await claudeToken();
    return res.status(200).json({
      configured: true,
      configuredAs,
      exchanged: Boolean(token),
      identity,
    });
  } catch (e) {
    // The reason, verbatim. Anthropic's body names which check failed, and
    // paraphrasing it here would throw away the only useful part.
    return res.status(200).json({
      configured: true,
      configuredAs,
      exchanged: false,
      identity,
      reason: e instanceof Error ? e.message : String(e),
    });
  }
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Wrapped like every other handler that may reach Claude — see
  // withRequestIdentity for why the token is scoped rather than threaded.
  return withRequestIdentity(req.headers, () => report(req, res));
}
