import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { hashPassword, signToken } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getDb, schema } from "../_lib/orm.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import { hashResetToken, MIN_PASSWORD_LENGTH } from "../_lib/resetToken.js";

const INVALID = {
  error: "This reset link is invalid or has expired. Request a new one.",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseJsonBody(req.body);
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!token) {
    return res.status(400).json(INVALID);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  }

  try {
    const db = getDb();
    const tokenHash = hashResetToken(token);

    // Claim the token and read its owner in one statement. The `used_at IS NULL`
    // guard in the UPDATE makes this atomic: two concurrent submissions of the
    // same link cannot both match, so a link is genuinely single-use.
    const claimed = await db
      .update(schema.passwordResetTokens)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(schema.passwordResetTokens.tokenHash, tokenHash),
          isNull(schema.passwordResetTokens.usedAt),
          gt(schema.passwordResetTokens.expiresAt, sql`now()`)
        )
      )
      .returning({ userId: schema.passwordResetTokens.userId });

    const userId = claimed[0]?.userId;
    if (!userId) {
      return res.status(400).json(INVALID);
    }

    const passwordHash = await hashPassword(password);
    const updated = await db
      .update(schema.users)
      .set({ passwordHash })
      .where(eq(schema.users.id, userId))
      .returning({ email: schema.users.email, id: schema.users.id });

    const [user] = updated;
    if (!user) {
      return res.status(400).json(INVALID);
    }

    // Any other outstanding link for this user is now stale.
    await db
      .update(schema.passwordResetTokens)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(schema.passwordResetTokens.userId, userId),
          isNull(schema.passwordResetTokens.usedAt)
        )
      );

    // Sign straight in — the user just proved control of the mailbox.
    const authToken = signToken({ email: user.email, sub: user.id });
    return res
      .status(200)
      .json({ token: authToken, user: { email: user.email, id: user.id } });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("JWT_SECRET")) {
      return res.status(500).json({ error: "JWT_SECRET is not configured." });
    }
    if (msg.includes("password_reset_tokens")) {
      return res.status(503).json({
        error:
          "Database schema is out of date. Run pnpm db:migrate against this deployment.",
      });
    }
    return res.status(500).json({ error: "Could not reset password" });
  }
}
