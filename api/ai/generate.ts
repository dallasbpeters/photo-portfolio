import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isFalModel } from "../../config/nodeTypes.js";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { generateImage, isFalConfigured } from "../_lib/fal.js";
import { parsePublicHttpUrl, sanitizeText } from "../_lib/httpUrl.js";
import { loadModelDefs } from "../_lib/models.js";
import { parseJsonBody } from "../_lib/parseBody.js";

/** Long enough for a considered prompt, short enough to bound the request. */
const MAX_PROMPT = 1200;

/** An explicit http(s) scheme, which the source image URL must carry. */
const HTTP_SCHEME = /^https?:\/\//i;

/**
 * Generates a board image, or a variation of an existing one.
 *
 * Admin-only, and deliberately so: every call spends money on the project's fal
 * account, so this must never be reachable by an anonymous visitor.
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

  if (!isFalConfigured()) {
    return res.status(503).json({
      error:
        "Image generation is not configured. Set FAL_API_KEY on the project.",
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

  // Validated rather than passed through: this URL is handed to a third party
  // to go and fetch, so it must be an ordinary public http(s) address.
  //
  // An explicit scheme is required here. parsePublicHttpUrl helpfully prepends
  // https:// to a bare host, which is right for an admin pasting one into a
  // form but wrong for this: it turns "file:///etc/passwd" into a URL that
  // looks legitimate and forwards it to someone else's fetcher.
  const rawSource =
    typeof body.sourceImageUrl === "string" ? body.sourceImageUrl.trim() : "";
  const hasScheme = HTTP_SCHEME.test(rawSource);
  const sourceImageUrl =
    rawSource && hasScheme ? parsePublicHttpUrl(rawSource) : null;
  if (rawSource && !sourceImageUrl) {
    return res.status(400).json({
      error: "The source image must be a public http(s) URL",
    });
  }

  /*
   * The model, checked against the table rather than trusted.
   *
   * `generateImage` hands this straight to fal, so an arbitrary string here
   * would be a paid request to whatever it named. An unknown id is treated as
   * "auto" rather than refused: this endpoint is also reached by callers that
   * have no model to offer, and the choice is an improvement on the default
   * rather than a requirement of it.
   */
  const requested = typeof body.model === "string" ? body.model.trim() : "";
  let model: string | null = null;
  if (requested && isFalModel(await loadModelDefs(getSql()), requested)) {
    model = requested;
  }

  try {
    const image = await generateImage(prompt, sourceImageUrl, model);
    return res.status(200).json(image);
  } catch (e) {
    console.error(e);
    const message =
      e instanceof Error ? e.message : "Could not generate an image";
    // A timeout is the common failure and is worth saying plainly, since the
    // fix is simply to try again.
    return res.status(502).json({ error: message });
  }
}
