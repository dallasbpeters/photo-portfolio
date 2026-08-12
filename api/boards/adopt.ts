import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { parsePublicHttpUrl } from "../_lib/httpUrl.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import { persistGenerated } from "../_lib/persistGenerated.js";

/**
 * Copies a picture we merely link to into storage we own.
 *
 * A board can hold images from anywhere — a Pinterest pin, a Framer page, a
 * Drive file — and referencing them by URL is exactly right for display. It
 * stops being right the moment the browser has to *read the pixels back*: a
 * canvas that has drawn an image from a host which sends no CORS headers is
 * tainted, and reading it throws. That is not a warning anyone sees coming,
 * because the picture is plainly there on screen.
 *
 * So compositing adopts its sources first. The fetch happens here rather than
 * in the browser because the browser cannot read those bytes either — which is
 * the whole problem — and because a URL handed to a fetcher is exactly the
 * shape of request that has to be checked against private address space.
 *
 * Idempotent from the caller's point of view: an image already in our storage
 * is returned unchanged rather than copied again.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Signed in only. This fetches a URL of the caller's choosing, so it is a
  // request forwarder — the same reason api/ai/generate.ts insists on an
  // explicit scheme rather than helpfully adding one.
  if (!getBearerUser(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = parseJsonBody(req.body);
  const url =
    typeof body.url === "string" ? parsePublicHttpUrl(body.url) : null;
  if (!url) {
    return res
      .status(422)
      .json({ error: "A public http(s) image URL is required" });
  }

  try {
    return res
      .status(200)
      .json({ url: await persistGenerated(url, "boards/adopted") });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "That image could not be copied" });
  }
}
