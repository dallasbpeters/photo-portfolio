/** Remove NULs (break Postgres text) and trim. */
export const sanitizeText = (s: string): string => s.replace(/\0/g, "").trim();

const HTTP_SCHEME_RE = /^https?:\/\//i;

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
