import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { isFalConfigured } from "../_lib/fal.js";
import { fetchFalLibrary, isFalMediaUrl } from "../_lib/falLibrary.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import { persistGenerated } from "../_lib/persistGenerated.js";

/**
 * Browsing what the fal account has already made, and keeping one of them.
 *
 * GET lists; POST adopts a chosen picture into our own storage. The two are
 * separate acts because they cost different things: listing is a cheap read of
 * metadata, while adopting copies bytes and should only happen for something
 * actually wanted on a board.
 *
 * Admin-only, and the key never leaves the server. Both matter more than usual
 * here: the listing includes every request made on the account — prompts,
 * inputs, model names — which is the whole history of what has been tried, and
 * not something to expose to a visitor.
 */

const falKey = (): string | null => process.env.FAL_API_KEY?.trim() || null;

async function handleList(
  key: string,
  req: VercelRequest,
  res: VercelResponse
) {
  const raw = req.query.page;
  const asked = Number(Array.isArray(raw) ? raw[0] : raw);
  const page = Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : 1;

  try {
    return res.status(200).json(await fetchFalLibrary(key, page));
  } catch (e) {
    // An alpha endpoint that changes shape or goes away should not take the
    // insert panel down with it — the other tabs still work.
    console.error(e);
    return res.status(502).json({
      error:
        e instanceof Error ? e.message : "Could not read the fal.ai library",
    });
  }
}

/**
 * Copies a chosen picture into our own storage and returns the durable URL.
 *
 * fal serves output from a scratch host, so a board holding one of those links
 * directly would quietly turn into broken images later. Adopting the bytes is
 * what makes it a thing on a board rather than a reference to someone else's
 * temporary file — the same reason every generation this app makes goes through
 * persistGenerated.
 */
async function handleImport(req: VercelRequest, res: VercelResponse) {
  const body = parseJsonBody(req.body) as {
    contentType?: unknown;
    url?: unknown;
  };
  const url = typeof body.url === "string" ? body.url : "";
  // Checked against the media allowlist, not merely parsed: this is a URL the
  // browser supplied and the server is about to go and fetch.
  if (!isFalMediaUrl(url)) {
    return res.status(400).json({ error: "That is not a fal.ai media URL" });
  }
  const contentType =
    typeof body.contentType === "string" ? body.contentType : null;

  try {
    return res.status(200).json({
      url: await persistGenerated(url, "boards/library", contentType),
    });
  } catch (e) {
    console.error(e);
    return res
      .status(502)
      .json({ error: e instanceof Error ? e.message : "Could not save that" });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (!getBearerUser(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!isFalConfigured()) {
    return res.status(503).json({
      error: "fal.ai is not configured. Set FAL_API_KEY on the project.",
    });
  }
  const key = falKey();
  if (!key) {
    return res.status(503).json({ error: "fal.ai is not configured" });
  }

  if (req.method === "GET") {
    return await handleList(key, req, res);
  }
  if (req.method === "POST") {
    return await handleImport(req, res);
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
