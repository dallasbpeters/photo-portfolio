import type { VercelRequest, VercelResponse } from "@vercel/node";
import { signToken, verifyPassword } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { parseJsonBody } from "../_lib/parseBody.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = parseJsonBody(req.body);
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!(email && password)) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT id, email, password_hash
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `;

    const row = rows[0] as
      | { id: string; email: string; password_hash: string }
      | undefined;
    if (!(row && (await verifyPassword(password, row.password_hash)))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signToken({ email: row.email, sub: row.id });
    return res.status(200).json({
      token,
      user: { email: row.email, id: row.id },
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("JWT_SECRET")) {
      return res.status(500).json({ error: "JWT_SECRET is not configured." });
    }
    if (msg.includes("DATABASE_URL") || msg.includes("Missing database URL")) {
      return res
        .status(500)
        .json({ error: "Database connection is not configured." });
    }
    return res.status(500).json({ error: "Login failed" });
  }
}
