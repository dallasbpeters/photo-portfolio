import { describe, expect, it } from "vitest";
import {
  ADVISORY_MS,
  freshness,
  MANDATORY_MS,
  OIDC_HEADER,
  tokenFromHeaders,
} from "./claudeTokenState.js";

/**
 * Trading Vercel's identity for a Claude token.
 *
 * The parts that decide behaviour rather than the round trip: when to swap the
 * token, where the assertion is read from, and whether federation is set up at
 * all. Each one fails in a way that reads as "authentication is broken" rather
 * than as the configuration mistake it is, which is why they are pinned here.
 */

describe("freshness", () => {
  const now = 1_000_000;

  it("leaves a token alone while it has time", () => {
    expect(freshness(now + ADVISORY_MS + 1, now)).toBe("fresh");
  });

  it("asks for a swap before it has to have one", () => {
    // At the advisory mark a failed exchange is survivable: the token in hand
    // is still good, so a provider having a bad minute costs nothing.
    expect(freshness(now + ADVISORY_MS, now)).toBe("should-refresh");
    expect(freshness(now + MANDATORY_MS + 1, now)).toBe("should-refresh");
  });

  it("insists once the token is nearly gone", () => {
    expect(freshness(now + MANDATORY_MS, now)).toBe("must-refresh");
  });

  it("insists on one that has already expired", () => {
    // The case a clock skew or a long cold start produces, and the one where
    // serving the cached token would send a dead credential to Anthropic.
    expect(freshness(now - 1, now)).toBe("must-refresh");
  });
});

describe("tokenFromHeaders", () => {
  it("reads the header a deployed function receives", () => {
    expect(tokenFromHeaders({ [OIDC_HEADER]: "  jwt-here  " })).toBe(
      "jwt-here"
    );
  });

  it("takes the first when a header arrives repeated", () => {
    expect(tokenFromHeaders({ [OIDC_HEADER]: ["first", "second"] })).toBe(
      "first"
    );
  });

  it("falls back to what vercel dev put in the environment", () => {
    // So the same code path works locally without a second branch anywhere.
    expect(tokenFromHeaders({}, "local-jwt")).toBe("local-jwt");
  });

  it("prefers the header, which belongs to this request", () => {
    expect(tokenFromHeaders({ [OIDC_HEADER]: "this-request" }, "stale")).toBe(
      "this-request"
    );
  });

  it("says nothing rather than empty when there is none", () => {
    expect(tokenFromHeaders({})).toBeNull();
    expect(tokenFromHeaders({ [OIDC_HEADER]: "   " }, "  ")).toBeNull();
  });
});
