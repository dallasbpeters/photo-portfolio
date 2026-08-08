import type { VercelRequest, VercelResponse } from "@vercel/node";
import { signToken } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import {
  GoogleNotConfiguredError,
  verifyGoogleIdToken,
} from "../_lib/googleAuth.js";
import { parseJsonBody } from "../_lib/parseBody.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseJsonBody(req.body);
  const credential =
    typeof body.credential === "string" ? body.credential.trim() : "";
  if (!credential) {
    return res.status(400).json({ error: "Missing Google credential" });
  }

  try {
    const identity = await verifyGoogleIdToken(credential);
    if (!identity) {
      return res
        .status(401)
        .json({ error: "Could not verify that Google account" });
    }

    // An unverified Google address proves nothing about mailbox ownership, so it
    // must not be usable to reach an admin account with the same address.
    if (!identity.emailVerified) {
      return res.status(403).json({
        error: "That Google account has no verified email address.",
      });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT id, email FROM users WHERE email = ${identity.email} LIMIT 1
    `;
    const user = rows[0] as { id: string; email: string } | undefined;

    // Google sign-in authenticates existing admins; it never creates one.
    // Otherwise anyone with a Google account could mint themselves access.
    if (!user) {
      return res.status(403).json({
        error: "That Google account is not authorized for this site.",
      });
    }

    const token = signToken({ email: user.email, sub: user.id });
    return res
      .status(200)
      .json({ token, user: { email: user.email, id: user.id } });
  } catch (e) {
    console.error(e);
    if (e instanceof GoogleNotConfiguredError) {
      return res.status(503).json({
        error: "Google sign-in is not configured",
        hint: "Set GOOGLE_CLIENT_ID (server) and VITE_GOOGLE_CLIENT_ID (client) on the project.",
      });
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("JWT_SECRET")) {
      return res.status(500).json({ error: "JWT_SECRET is not configured." });
    }
    return res.status(500).json({ error: "Google sign-in failed" });
  }
}
