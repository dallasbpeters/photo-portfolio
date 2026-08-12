import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { type FramerResult, fetchFramerPage } from "../_lib/framer.js";
import { parseJsonBody } from "../_lib/parseBody.js";

/**
 * The images on a published Framer page.
 *
 * Admin-only, for the same reason as the Pinterest endpoints: the server goes
 * and fetches a URL that someone else typed. Unlike those, the address can be
 * any domain — a Framer site is published wherever its owner points it — so
 * there is no host allowlist to lean on and the guard is where the name
 * resolves. See api/_lib/publicHost.ts.
 */
/**
 * Says which of the several possible problems actually happened.
 *
 * One message covering every failure was worse than useless: "it needs to be a
 * published site" is what you get told when the real answer is that the host
 * does not exist, or that the page returned a 404 — neither of which is fixed
 * by publishing anything.
 */
const refusalMessage = (
  result: Extract<FramerResult, { ok: false }>
): string => {
  switch (result.reason) {
    case "credentials":
      return "That address carries a username or password. Paste the plain page link.";
    case "malformed":
      return "That does not look like a web address.";
    case "protected":
      return "That site is not public — it redirects to a sign-in page. Framer's staging sites sit behind a Framer account, so point this at the published site instead.";
    case "private":
      return "That address points somewhere private rather than to a site on the internet.";
    case "unresolved":
      return "No such site — that domain does not resolve. Check the spelling.";
    case "unreachable":
      return "Could not reach that site. Check the address, or try again if it is just slow.";
    default:
      return result.status === 404
        ? "That page does not exist on the site. Check the path."
        : `The site answered with an error (${result.status ?? "no response"}).`;
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!getBearerUser(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = parseJsonBody(req) as { url?: unknown };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return res.status(400).json({ error: "A page address is required" });
  }

  try {
    const result = await fetchFramerPage(url);
    if (!result.ok) {
      return res.status(400).json({ error: refusalMessage(result) });
    }
    const { page } = result;
    if (page.images.length === 0) {
      return res.status(200).json({
        ...page,
        // Not an error: a page really can have no Framer-hosted images on it,
        // and saying so is more use than an empty grid.
        notice:
          "That page loaded, but none of its images are Framer assets. Try a page with the work on it.",
      });
    }
    return res.status(200).json(page);
  } catch (e) {
    console.error(e);
    return res
      .status(502)
      .json({ error: e instanceof Error ? e.message : "Could not read that" });
  }
}
