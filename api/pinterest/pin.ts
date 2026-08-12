import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import {
  fromOEmbed,
  fromOpenGraph,
  parsePinterestUrl,
} from "../_lib/pinterest.js";

/**
 * Resolves a pasted Pinterest pin link into something a board can show.
 *
 * Admin-only, like every other insert path: this makes the server fetch a URL
 * someone else typed, which is exactly the shape of request that must not be
 * reachable anonymously. The host allowlist in api/_lib/pinterest.ts is what
 * stops it being a general-purpose proxy.
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
  const pin = parsePinterestUrl(raw);
  if (!pin) {
    return res.status(400).json({ error: "That is not a Pinterest link." });
  }

  try {
    const result = (await fromOEmbed(pin)) ?? (await fromOpenGraph(pin));
    if (!result) {
      return res.status(422).json({
        error:
          "Could not read that pin. Private and deleted pins publish nothing to read.",
      });
    }
    return res.status(200).json(result);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "Could not reach Pinterest" });
  }
}
