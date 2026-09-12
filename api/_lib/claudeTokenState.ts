/**
 * When to trade a Claude token in, and where the assertion came from.
 *
 * Split from claudeAuth.ts for the same reason falLimits.ts was split from
 * shrinkForFal.ts: that file reads `process.env`, which does not exist in the
 * browser environment this project's tests run in. This half is pure, and it
 * is the half worth pinning — both answers fail in a way that reads as
 * "authentication is broken" rather than as the mistake it actually is.
 */

/** The header Vercel puts its signed identity token in, inside a function. */
export const OIDC_HEADER = "x-vercel-oidc-token";

/**
 * When to trade the token in again, in milliseconds before it expires.
 *
 * Two tiers rather than one, which is the shape the Anthropic SDKs use and the
 * reason is worth keeping: at the advisory mark a failed exchange is survivable
 * because the token in hand is still good for a while, so a provider having a
 * bad minute costs nothing. At the mandatory mark it is not, and the failure
 * has to surface rather than be served past expiry.
 */
export const ADVISORY_MS = 120_000;
export const MANDATORY_MS = 30_000;

export type Freshness = "fresh" | "must-refresh" | "should-refresh";

export const freshness = (expiresAt: number, now: number): Freshness => {
  const left = expiresAt - now;
  if (left <= MANDATORY_MS) {
    return "must-refresh";
  }
  return left <= ADVISORY_MS ? "should-refresh" : "fresh";
};

/**
 * The identity token Vercel signed for this request.
 *
 * Header first, then whatever the environment held. The header is how a
 * deployed function receives it; the variable is what `vercel dev` sets, so
 * one code path covers both. The fallback is passed in rather than read here,
 * which is what keeps this side free of `process`.
 */
export const tokenFromHeaders = (
  headers: Record<string, string | string[] | undefined>,
  fallback = ""
): string | null => {
  const raw = headers[OIDC_HEADER];
  const fromHeader = Array.isArray(raw) ? raw[0] : raw;
  return (fromHeader ?? "").trim() || fallback.trim() || null;
};
