import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { handleCors } from "../_lib/cors.js";
import {
  EmailNotConfiguredError,
  passwordResetEmail,
  sendEmail,
} from "../_lib/email.js";
import { getDb, schema } from "../_lib/orm.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import {
  createResetToken,
  hashResetToken,
  RESET_TOKEN_TTL_MINUTES,
} from "../_lib/resetToken.js";
import { getSite } from "../_lib/site.js";

/** Cap on unused, unexpired tokens per user — blunts using this endpoint as a mail bomb. */
const MAX_ACTIVE_TOKENS = 3;

/**
 * Always answers 200 with the same body whether or not the address exists.
 * Revealing which emails have accounts would turn this into an account oracle.
 */
const ACCEPTED = {
  message: "If that email has an account, a reset link is on its way.",
  ok: true,
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
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  // Fail before doing any work if mail can't be sent, so a misconfigured
  // deployment reports itself instead of silently swallowing every request.
  if (!process.env.RESEND_API_KEY?.trim()) {
    return res.status(503).json({
      error: "Email is not configured",
      hint: "Set RESEND_API_KEY on the project (all environments). See .env.example.",
    });
  }

  try {
    const db = getDb();
    const site = getSite();

    const [user] = await db
      .select({ email: schema.users.email, id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    // Unknown address: stop here, but still answer ACCEPTED.
    if (!user) {
      return res.status(200).json(ACCEPTED);
    }

    const [active] = await db
      .select({ n: count() })
      .from(schema.passwordResetTokens)
      .where(
        and(
          eq(schema.passwordResetTokens.userId, user.id),
          isNull(schema.passwordResetTokens.usedAt),
          gt(schema.passwordResetTokens.expiresAt, sql`now()`)
        )
      );
    if ((active?.n ?? 0) >= MAX_ACTIVE_TOKENS) {
      return res.status(200).json(ACCEPTED);
    }

    const token = createResetToken();
    const tokenHash = hashResetToken(token);
    const forwarded = req.headers["x-forwarded-for"];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)
        ?.split(",")[0]
        ?.trim() ?? null;

    await db.insert(schema.passwordResetTokens).values({
      expiresAt: sql`now() + ${`${RESET_TOKEN_TTL_MINUTES} minutes`}::interval`,
      requestedIp: ip,
      tokenHash,
      userId: user.id,
    });

    const resetUrl = `https://${site.domain}/reset-password?token=${encodeURIComponent(token)}`;
    const { subject, html, text } = passwordResetEmail(
      resetUrl,
      RESET_TOKEN_TTL_MINUTES
    );
    await sendEmail({ html, subject, text, to: user.email });

    return res.status(200).json(ACCEPTED);
  } catch (e) {
    console.error(e);
    if (e instanceof EmailNotConfiguredError) {
      return res.status(503).json({ error: "Email is not configured" });
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("password_reset_tokens")) {
      return res.status(503).json({
        error:
          "Database schema is out of date. Run pnpm db:migrate against this deployment.",
      });
    }
    return res.status(500).json({ error: "Could not send reset email" });
  }
}
