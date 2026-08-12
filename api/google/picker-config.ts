import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";

/**
 * What the Drive picker needs to start, handed out only to a signed-in admin.
 *
 * Google's picker reads a developer key in the browser, so the key has to reach
 * the browser somehow — that part is not negotiable. What *is* negotiable is
 * how it gets there. A `VITE_`-prefixed variable is compiled into the public
 * bundle, which means the key ships to every visitor of the site, signed in or
 * not, and can be lifted out of a JS file by anyone who loads the page.
 *
 * Fetching it here instead keeps it out of the bundle entirely and puts it
 * behind the admin session. It still lives in browser memory for as long as the
 * picker is open, which no arrangement can avoid — the real control on a
 * browser key is the HTTP-referrer restriction set on it in Google Cloud, and
 * that should be set regardless.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!getBearerUser(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!(apiKey && clientId)) {
    return res.status(503).json({
      error: "Google Drive is not configured",
      hint: "Set GOOGLE_API_KEY and GOOGLE_CLIENT_ID on the project, and enable the Drive and Picker APIs.",
    });
  }

  // Never cached by a shared cache: this is per-admin and short-lived by
  // intention, not a public configuration document.
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({ apiKey, clientId });
}
