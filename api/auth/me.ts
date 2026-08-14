import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";

/**
 * Who this session belongs to.
 *
 * The admin shell only ever knew a token *existed* in local storage, so any
 * stale or forged value skipped the login screen and left a page that 401'd
 * on every call. This is the check the shell was missing: a valid token is
 * confirmed here before the admin is shown, and anything else is thrown out.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.status(200).json({ user: { email: user.email, id: user.userId } });
}
