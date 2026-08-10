import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import { fromBoardRss, parsePinterestUrl } from "../_lib/pinterest.js";

/**
 * Every pin a Pinterest board publishes, from its RSS feed.
 *
 * Pinterest still serves `<board-url>.rss` publicly, which is the one surface
 * that hands back a whole board rather than a single pin — no OAuth, no app
 * review. It is a feed, so it carries a page of the most recent pins rather
 * than the board's entire history; reading past that does need an approved app.
 *
 * Admin-only for the same reason as the pin endpoint: the server fetches a URL
 * that someone else typed.
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

  const body = parseJsonBody(req.body);
  const raw = typeof body.url === "string" ? body.url : "";
  const board = parsePinterestUrl(raw);
  if (!board) {
    return res
      .status(400)
      .json({ error: "That is not a Pinterest board link." });
  }

  try {
    const result = await fromBoardRss(board);
    if (!result) {
      return res.status(422).json({
        error:
          "Could not read that board. Secret boards publish no feed, and a profile link is not a board — open the board itself and copy its address.",
      });
    }
    return res.status(200).json(result);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "Could not reach Pinterest" });
  }
}
