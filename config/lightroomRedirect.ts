import { SITES } from "./sites.js";

/**
 * The callback path, and the Adobe console values that have to cover it.
 *
 * One codebase serves three sites from three deployments, and Adobe's console
 * has room for exactly one "Default redirect URI" and one "Redirect URI
 * pattern". That looked like a problem and is not: the pattern field takes
 * a comma-separated list of regexes, so one integration can cover every
 * site.
 *
 * The rules, from Adobe's own documentation, and each of them is a way to get
 * this wrong:
 *
 *   - the pattern is a regular expression, so periods must be escaped as `\.`
 *     — an unescaped dot matches any character, which is a wider match than
 *     anybody intends
 *   - wildcards are allowed only in the *path*, never in a subdomain or a port,
 *     so `https://.*\.example\.com/…` is refused
 *   - the requested redirect_uri must match the pattern or the handshake is
 *     refused, and Adobe's error does not say which part disagreed
 *
 * Generated from SITES rather than written out, so adding a site adds it here
 * too. Kept in config/ and dependency-free like sites.ts, so the panel can show
 * it and a test can check it.
 */

/** Where Adobe sends the browser back. One path, every site. */
export const LIGHTROOM_CALLBACK_PATH = "/api/lightroom/callback";

/** A trailing slash on an origin, which the callback path supplies itself. */
const TRAILING_SLASH = /\/$/;

/** A host with its dots escaped, ready to sit in Adobe's regex. */
const escapeHost = (host: string): string => host.replaceAll(".", "\\.");

/**
 * Every origin the callback can legitimately arrive at.
 *
 * Taken from each site's declared `origins` rather than its `domain`, because
 * the www variants are real: somebody who reaches the admin at www and connects
 * from there sends a www redirect_uri, and a pattern covering only the apex
 * refuses it.
 */
export const lightroomRedirectUris = (): string[] => {
  const uris = new Set<string>();
  for (const site of Object.values(SITES)) {
    for (const origin of site.origins) {
      uris.add(
        `${origin.replace(TRAILING_SLASH, "")}${LIGHTROOM_CALLBACK_PATH}`
      );
    }
  }
  return [...uris].sort();
};

/**
 * The string to paste into "Redirect URI pattern".
 *
 * Comma separated with no spaces: the field is a list of regexes and a stray
 * space becomes part of one, which then matches nothing.
 */
export const lightroomRedirectPattern = (): string =>
  lightroomRedirectUris()
    .map((uri) => {
      const url = new URL(uri);
      return `${url.protocol}//${escapeHost(url.host)}${url.pathname.replaceAll(".", "\\.")}`;
    })
    .join(",");

/**
 * What goes in "Default redirect URI" — one value, so it has to be chosen.
 *
 * The site this deployment serves, when that is known, because the default is
 * what Adobe uses if a request supplies no redirect_uri of its own. Falling back
 * to the first configured site keeps the panel able to show *something* useful
 * rather than an empty field.
 */
export const lightroomDefaultRedirectUri = (siteKey?: string): string => {
  const site = siteKey
    ? Object.values(SITES).find((candidate) => candidate.key === siteKey)
    : undefined;
  const [firstSite] = Object.values(SITES);
  const [origin] = (site ?? firstSite).origins;
  return `${origin.replace(TRAILING_SLASH, "")}${LIGHTROOM_CALLBACK_PATH}`;
};
