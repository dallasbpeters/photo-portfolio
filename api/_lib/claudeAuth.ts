/**
 * Authenticating to Claude with Vercel's own identity, and no key at all.
 *
 * Every other provider here is reached with a long-lived secret sitting in the
 * environment. This one is not: Vercel signs a short-lived OIDC token for each
 * request, Anthropic trades it for an access token that expires in an hour, and
 * nothing anywhere is a credential that could be leaked from a `.env` file or
 * a screenshot.
 *
 * The token arrives as a *request header*, which is the one structural fact
 * that matters here. `falKey()` next door reads an environment variable at
 * module scope, and that shape cannot work: outside a request there is no
 * identity to present, so every caller has to hand the request down. That is
 * the cost of the feature and it is worth paying once, visibly, rather than
 * discovering it as an intermittent auth failure.
 *
 * Set up in the Claude Console under Settings → Workload identity. The issuer
 * is Vercel's team-mode URL — https://oidc.vercel.com/<team> — which serves
 * OIDC discovery, so Anthropic fetches the signing keys itself and there is
 * nothing to paste or rotate.
 */

import { freshness, tokenFromHeaders } from "./claudeTokenState.js";

const TOKEN_URL = "https://api.anthropic.com/v1/oauth/token";

/**
 * What the exchange needs beyond the token itself, from the environment.
 *
 * Null when federation is not configured, which is the ordinary state of a
 * machine that has not been set up — the caller then says so plainly instead
 * of failing at Anthropic with an error about a malformed request.
 */
export interface Federation {
  organizationId: string;
  ruleId: string;
  serviceAccountId: string;
  /** Only required when the rule covers more than one workspace. */
  workspaceId: string | null;
}

const trimmed = (name: string): string => (process.env[name] ?? "").trim();

export const federationConfig = (): Federation | null => {
  const organizationId = trimmed("ANTHROPIC_ORGANIZATION_ID");
  const ruleId = trimmed("ANTHROPIC_FEDERATION_RULE_ID");
  const serviceAccountId = trimmed("ANTHROPIC_SERVICE_ACCOUNT_ID");
  if (!(organizationId && ruleId && serviceAccountId)) {
    return null;
  }
  return {
    organizationId,
    ruleId,
    serviceAccountId,
    workspaceId: trimmed("ANTHROPIC_WORKSPACE_ID") || null,
  };
};

interface Minted {
  expiresAt: number;
  token: string;
}

/*
 * Remembered between requests, on purpose.
 *
 * A warm function container serves many requests, and an exchange per request
 * would be a round trip Anthropic never asked for. The cached token is the
 * thing being reused — never the Vercel token, which is single-use by `jti`
 * and comes fresh with each request anyway.
 */
let minted: Minted | null = null;

/** Forgets the cached token. For tests, and for a failure worth retrying. */
export const forgetClaudeToken = (): void => {
  minted = null;
};

const exchange = async (
  assertion: string,
  federation: Federation
): Promise<Minted> => {
  const res = await fetch(TOKEN_URL, {
    body: JSON.stringify({
      assertion,
      federation_rule_id: federation.ruleId,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      organization_id: federation.organizationId,
      service_account_id: federation.serviceAccountId,
      ...(federation.workspaceId
        ? { workspace_id: federation.workspaceId }
        : {}),
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    // The body carries the reason — a rule that did not match, an issuer that
    // is not registered, a replayed jti — and every one of them is a
    // configuration mistake somebody can act on. Swallowing it would leave
    // "authentication failed" and nothing to go on.
    throw new Error(
      `Claude rejected the identity token (${res.status}): ${(
        await res.text()
      ).slice(0, 300)}`
    );
  }
  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) {
    throw new Error("Claude returned no access token");
  }
  return {
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    token: body.access_token,
  };
};

/**
 * An access token for Claude, exchanged or reused.
 *
 * Throws rather than returning null when federation is configured and the
 * exchange fails: a caller that cannot authenticate cannot do its work, and
 * the reason belongs in the error rather than in a log nobody reads.
 *
 * Returns null only when nothing is configured, so a caller can say "Claude is
 * not set up here" — the same shape `isFalConfigured` gives.
 */
export const claudeToken = async (
  headers: Record<string, string | string[] | undefined>
): Promise<string | null> => {
  const federation = federationConfig();
  if (!federation) {
    return null;
  }
  const now = Date.now();
  if (minted && freshness(minted.expiresAt, now) === "fresh") {
    return minted.token;
  }
  const assertion = tokenFromHeaders(
    headers,
    process.env.VERCEL_OIDC_TOKEN ?? ""
  );
  if (!assertion) {
    throw new Error(
      "No Vercel identity token on this request. Is OIDC Federation enabled for this project?"
    );
  }
  try {
    minted = await exchange(assertion, federation);
    return minted.token;
  } catch (cause) {
    /*
     * A token that is merely near expiry is still a token.
     *
     * At the advisory mark the cached one has a minute and a half left, so an
     * exchange that fails there costs nothing and the request goes through.
     * Past the mandatory mark it does not, and the error surfaces.
     */
    if (minted && freshness(minted.expiresAt, now) === "should-refresh") {
      return minted.token;
    }
    minted = null;
    throw cause;
  }
};
