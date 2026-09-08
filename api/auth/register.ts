import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq } from "drizzle-orm";
import { hashPassword } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getDb, schema } from "../_lib/orm.js";
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

    const db = getDb();
    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await hashPassword(password);
    const inserted = await db
      .insert(schema.users)
      .values({ email, passwordHash })
      .returning({
        createdAt: schema.users.createdAt,
        email: schema.users.email,
        id: schema.users.id,
      });

    const [row] = inserted;
    return res.status(201).json({
      user: {
        // Drizzle reads timestamptz as the text Postgres prints, which is not
        // ISO 8601; the raw driver used to hand over a Date that JSON turned
        // into ISO for free. Normalised here so the response shape is the same
        // either way.
        createdAt: new Date(row.createdAt).toISOString(),
        email: row.email,
        id: row.id,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Registration failed" });
  }
}
