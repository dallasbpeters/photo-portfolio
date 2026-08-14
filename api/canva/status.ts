import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isCanvaConfigured } from "../../config/canva.js";
import { getBearerUser } from "../_lib/auth.js";
import { hasToken } from "../_lib/canva.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";

/** Whether the admin can send to Canva right now. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
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
  const configured = isCanvaConfigured();
  const connected = configured ? await hasToken(getSql(), user.userId) : false;
  return res.status(200).json({ configured, connected });
}
