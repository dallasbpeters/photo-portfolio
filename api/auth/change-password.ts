import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getBearerUser, hashPassword, verifyPassword } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getDb, schema } from "../_lib/orm.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import { MIN_PASSWORD_LENGTH } from "../_lib/resetToken.js";

/**
 * Changes a signed-in user's password.
 *
 * The current password is required and checked first — possession of the
 * session alone must not be enough to change a credential, in case the session
 * leaked. A successful change signs nothing new out; the existing token stays
 * valid, which is the usual expectation.
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

  const body = parseJsonBody(req.body) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };
  const current =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const next = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!current) {
    return res.status(400).json({ error: "Your current password is required" });
  }
  if (next.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      error: `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  }

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: schema.users.id,
        passwordHash: schema.users.passwordHash,
      })
      .from(schema.users)
      .where(eq(schema.users.id, user.userId))
      .limit(1);

    const [row] = rows;
    if (!row) {
      return res.status(404).json({ error: "That account no longer exists" });
    }
    if (!(await verifyPassword(current, row.passwordHash))) {
      return res
        .status(400)
        .json({ error: "Your current password is incorrect" });
    }

    const passwordHash = await hashPassword(next);
    await db
      .update(schema.users)
      .set({ passwordHash })
      .where(eq(schema.users.id, row.id));

    // Any outstanding reset links for this user are now stale — a password that
    // was just set by hand should not be overridable by an old email.
    await db
      .update(schema.passwordResetTokens)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(schema.passwordResetTokens.userId, row.id),
          isNull(schema.passwordResetTokens.usedAt)
        )
      );

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("JWT_SECRET")) {
      return res.status(500).json({ error: "JWT_SECRET is not configured." });
    }
    return res.status(500).json({ error: "Could not change the password" });
  }
}
