import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hashPassword } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { parseJsonBody } from "../_lib/parseBody.js";

const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const setupSecret = process.env.ADMIN_SETUP_SECRET;
  if (!setupSecret) {
    return res.status(503).json({
      error:
        "Registration is disabled. Set ADMIN_SETUP_SECRET to enable guarded sign-up.",
    });
  }

  try {
    const body = parseJsonBody(req.body);
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const secret = typeof body.setupSecret === "string" ? body.setupSecret : "";

    if (!safeEqual(secret, setupSecret)) {
      return res.status(403).json({ error: "Invalid setup secret" });
    }

    if (!(email && password) || password.length < 8) {
      return res.status(400).json({
        error: "Valid email and password (min 8 characters) are required",
      });
    }

    const sql = getSql();
    const existing = await sql`
      SELECT id FROM users WHERE email = ${email} LIMIT 1
    `;
    if (existing.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await hashPassword(password);
    const inserted = await sql`
      INSERT INTO users (email, password_hash)
      VALUES (${email}, ${passwordHash})
      RETURNING id, email, created_at
    `;

    const row = inserted[0] as {
      id: string;
      email: string;
      created_at: string;
    };
    return res.status(201).json({
      user: { createdAt: row.created_at, email: row.email, id: row.id },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Registration failed" });
  }
}
