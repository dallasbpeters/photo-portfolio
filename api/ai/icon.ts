import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isIconStyle } from "../../config/iconStyles.js";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { sanitizeText } from "../_lib/httpUrl.js";
import { generateIcon, isMagnificConfigured } from "../_lib/magnific.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import { getSite } from "../_lib/site.js";

/** An icon is described in a few words; a paragraph is not a glyph. */
const MAX_PROMPT = 300;

/**
 * Generates an SVG icon for a board.
 *
 * Admin-only for the same reason as /api/ai/generate: every call spends money
 * on the project's Magnific account, so it must never be reachable by an
 * anonymous visitor.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isMagnificConfigured()) {
    return res.status(503).json({
      error:
        "Icon generation is not configured. Set MAGNIFIC_API_KEY on the project.",
    });
  }

  const body = parseJsonBody(req.body);
  const prompt =
    typeof body.prompt === "string"
      ? sanitizeText(body.prompt).slice(0, MAX_PROMPT)
      : "";
  if (!prompt) {
    return res.status(400).json({ error: "A prompt is required" });
  }

  // An allowlist rather than a pass-through: the value reaches a third party,
  // and an unknown style is a request that fails after it has been paid for.
  const style = isIconStyle(body.style) ? body.style : "solid";

  try {
    // Required by the API even though this polls for the result. It points at
    // our own sink so a completion notice is answered rather than retried
    // against a URL that does not exist.
    const site = getSite();
    const icon = await generateIcon(
      prompt,
      style,
      `https://${site.domain}/api/ai/icon-webhook`
    );
    return res.status(200).json(icon);
  } catch (e) {
    console.error(e);
    const message =
      e instanceof Error ? e.message : "Could not generate an icon";
    return res.status(502).json({ error: message });
  }
}
