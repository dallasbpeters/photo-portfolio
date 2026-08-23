import { describe, expect, it } from "vitest";
import {
  lightroomDefaultRedirectUri,
  lightroomRedirectPattern,
  lightroomRedirectUris,
} from "./lightroomRedirect.js";
import { SITES } from "./sites.js";

/**
 * Adobe's console has one slot for a pattern and refuses a handshake whose
 * redirect_uri does not match it — with an error that does not say so. So the
 * property worth pinning is the round trip: every URI this app can legitimately
 * send must be matched by the pattern this app tells somebody to paste.
 */

describe("lightroomRedirectUris", () => {
  it("covers every origin of every site, apex and www", () => {
    const uris = lightroomRedirectUris();
    for (const site of Object.values(SITES)) {
      for (const origin of site.origins) {
        expect(uris, site.key).toContain(`${origin}/api/lightroom/callback`);
      }
    }
  });

  it("has no duplicates", () => {
    const uris = lightroomRedirectUris();
    expect(new Set(uris).size).toBe(uris.length);
  });
});

describe("lightroomRedirectPattern", () => {
  it("escapes every period, since an unescaped dot matches anything", () => {
    // The rule that is easiest to get wrong and hardest to notice: an
    // unescaped dot is a wildcard, so the pattern silently matches hosts
    // nobody intended.
    for (const part of lightroomRedirectPattern().split(",")) {
      const withoutEscaped = part.replaceAll("\\.", "");
      expect(withoutEscaped, part).not.toContain(".");
    }
  });

  it("is comma separated with no spaces", () => {
    // A stray space becomes part of a regex, which then matches nothing.
    expect(lightroomRedirectPattern()).not.toContain(" ");
  });

  it("matches every URI the app can actually send", () => {
    /*
     * The assertion that matters. Adobe applies each comma-separated part as a
     * regex against the requested redirect_uri; if none matches, the handshake
     * is refused. This checks the pattern we hand somebody against the URIs we
     * would hand Adobe.
     */
    const parts = lightroomRedirectPattern()
      .split(",")
      .map((part) => new RegExp(`^${part}$`));
    for (const uri of lightroomRedirectUris()) {
      expect(
        parts.some((pattern) => pattern.test(uri)),
        uri
      ).toBe(true);
    }
  });

  it("does not match a host it should not", () => {
    // What the escaping buys. With unescaped dots, "dallaspetersXcom" would
    // match and so would any number of lookalike hosts.
    const parts = lightroomRedirectPattern()
      .split(",")
      .map((part) => new RegExp(`^${part}$`));
    for (const hostile of [
      "https://dallaspetersXcom/api/lightroom/callback",
      "https://evil.com/api/lightroom/callback",
      "https://dallaspeters.com.evil.com/api/lightroom/callback",
      "https://dallaspeters.com/api/lightroom/callbackX",
    ]) {
      expect(
        parts.some((pattern) => pattern.test(hostile)),
        hostile
      ).toBe(false);
    }
  });

  it("uses no wildcard in a host, which Adobe refuses", () => {
    for (const part of lightroomRedirectPattern().split(",")) {
      const host = part.slice("https://".length).split("/")[0];
      expect(host, part).not.toMatch(/[*+?()[\]]/);
    }
  });
});

describe("lightroomDefaultRedirectUri", () => {
  it("names the site it is asked about", () => {
    expect(lightroomDefaultRedirectUri("cyan")).toBe(
      "https://cyansphotos.com/api/lightroom/callback"
    );
    expect(lightroomDefaultRedirectUri("addison")).toBe(
      "https://addisonsphotos.com/api/lightroom/callback"
    );
  });

  it("still answers for an unknown or absent key", () => {
    // A site created from the admin is not in sites.ts — see resolveSite.
    expect(lightroomDefaultRedirectUri("not-a-site")).toContain(
      "/api/lightroom/callback"
    );
    expect(lightroomDefaultRedirectUri()).toContain("/api/lightroom/callback");
  });
});
