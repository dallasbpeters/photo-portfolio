/** Remove NULs (break Postgres text) and trim. */
export const sanitizeText = (s: string): string => s.replace(/\0/g, "").trim();

const HTTP_SCHEME_RE = /^https?:\/\//i;

/**
 * Whether a hostname is the allowed host or a subdomain of it.
 *
 * Anywhere the server fetches a URL somebody else supplied needs this, not just
 * one connector: parsePublicHttpUrl below establishes that a string is a URL,
 * which is a different question from whether it points somewhere we are willing
 * to go. The `.` before the suffix is what stops "notfal.media" matching
 * "fal.media".
 */
export const hostMatches = (host: string, allowed: string[]): boolean => {
  const lower = host.toLowerCase();
  return allowed.some(
    (candidate) => lower === candidate || lower.endsWith(`.${candidate}`)
  );
};

/**
 * Accepts http(s) image URLs. Returns canonical href or null.
 * Adds https:// when the user pastes a host/path without a scheme.
 */
export const parsePublicHttpUrl = (raw: string): string | null => {
  const trimmed = sanitizeText(raw);
  if (!trimmed) {
    return null;
  }
  let toParse = trimmed;
  if (!HTTP_SCHEME_RE.test(toParse)) {
    toParse = `https://${toParse}`;
  }
  try {
    const u = new URL(toParse);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return null;
    }
    if (u.username || u.password) {
      return null;
    }
    return u.href;
  } catch {
    return null;
  }
};
