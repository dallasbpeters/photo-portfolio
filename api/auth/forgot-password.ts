import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql } from '../_lib/db.js';
import { handleCors } from '../_lib/cors.js';
import { parseJsonBody } from '../_lib/parseBody.js';
import { EmailNotConfiguredError, passwordResetEmail, sendEmail } from '../_lib/email.js';
import { getSite } from '../_lib/site.js';
import { createResetToken, hashResetToken, RESET_TOKEN_TTL_MINUTES } from '../_lib/resetToken.js';

/** Cap on unused, unexpired tokens per user — blunts using this endpoint as a mail bomb. */
const MAX_ACTIVE_TOKENS = 3;

/**
 * Always answers 200 with the same body whether or not the address exists.
 * Revealing which emails have accounts would turn this into an account oracle.
 */
const ACCEPTED = {
  ok: true,
  message: 'If that email has an account, a reset link is on its way.',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = parseJsonBody(req.body);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Fail before doing any work if mail can't be sent, so a misconfigured
  // deployment reports itself instead of silently swallowing every request.
  if (!process.env.RESEND_API_KEY?.trim()) {
    return res.status(503).json({
      error: 'Email is not configured',
      hint: 'Set RESEND_API_KEY on the project (all environments). See .env.example.',
    });
  }

  try {
    const sql = getSql();
    const site = getSite();

    const users = await sql`SELECT id, email FROM users WHERE email = ${email} LIMIT 1`;
    const user = users[0] as { id: string; email: string } | undefined;

    // Unknown address: stop here, but still answer ACCEPTED.
    if (!user) return res.status(200).json(ACCEPTED);

    const active = await sql`
      SELECT COUNT(*)::int AS n
      FROM password_reset_tokens
      WHERE user_id = ${user.id} AND used_at IS NULL AND expires_at > now()
    `;
    if (((active[0] as { n: number } | undefined)?.n ?? 0) >= MAX_ACTIVE_TOKENS) {
      return res.status(200).json(ACCEPTED);
    }

    const token = createResetToken();
    const tokenHash = hashResetToken(token);
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ?? null;

    await sql`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
      VALUES (
        ${user.id},
        ${tokenHash},
        now() + ${`${RESET_TOKEN_TTL_MINUTES} minutes`}::interval,
        ${ip}
      )
    `;

    const resetUrl = `https://${site.domain}/reset-password?token=${encodeURIComponent(token)}`;
    const { subject, html, text } = passwordResetEmail(resetUrl, RESET_TOKEN_TTL_MINUTES);
    await sendEmail({ to: user.email, subject, html, text });

    return res.status(200).json(ACCEPTED);
  } catch (e) {
    console.error(e);
    if (e instanceof EmailNotConfiguredError) {
      return res.status(503).json({ error: 'Email is not configured' });
    }
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('password_reset_tokens')) {
      return res.status(503).json({
        error: 'Database schema is out of date. Run pnpm db:migrate against this deployment.',
      });
    }
    return res.status(500).json({ error: 'Could not send reset email' });
  }
}
