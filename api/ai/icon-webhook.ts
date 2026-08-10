import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Where Magnific's icon completion notices land.
 *
 * Deliberately does nothing. The API requires a webhook_url on every icon
 * request, but /api/ai/icon polls the task instead of waiting on a callback —
 * a webhook cannot reach a development machine, and an admin should not have to
 * deploy to try an icon out.
 *
 * It exists so that the required URL resolves: pointing at nothing would leave
 * Magnific retrying a 404 against the site for every icon ever generated.
 * Nothing is read from the body, so there is no payload to authenticate.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  return res.status(204).end();
}
