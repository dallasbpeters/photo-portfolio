import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql } from '../_lib/db.js';
import { handleCors } from '../_lib/cors.js';
import { hashPassword, signToken } from '../_lib/auth.js';
import { parseJsonBody } from '../_lib/parseBody.js';
import { hashResetToken, MIN_PASSWORD_LENGTH } from '../_lib/resetToken.js';

const INVALID = { error: 'This reset link is invalid or has expired. Request a new one.' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = parseJsonBody(req.body);
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!token) return res.status(400).json(INVALID);
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res
      .status(400)
      .json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }

  try {
    const sql = getSql();
    const tokenHash = hashResetToken(token);

    // Claim the token and read its owner in one statement. The `used_at IS NULL`
    // guard in the UPDATE makes this atomic: two concurrent submissions of the
    // same link cannot both match, so a link is genuinely single-use.
    const claimed = await sql`
      UPDATE password_reset_tokens
      SET used_at = now()
      WHERE token_hash = ${tokenHash}
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING user_id
    `;

    const userId = (claimed[0] as { user_id: string } | undefined)?.user_id;
    if (!userId) return res.status(400).json(INVALID);

    const passwordHash = await hashPassword(password);
    const updated = await sql`
      UPDATE users
      SET password_hash = ${passwordHash}
      WHERE id = ${userId}
      RETURNING id, email
    `;

    const user = updated[0] as { id: string; email: string } | undefined;
    if (!user) return res.status(400).json(INVALID);

    // Any other outstanding link for this user is now stale.
    await sql`
      UPDATE password_reset_tokens
      SET used_at = now()
      WHERE user_id = ${userId} AND used_at IS NULL
    `;

    // Sign straight in — the user just proved control of the mailbox.
    const authToken = signToken({ sub: user.id, email: user.email });
    return res.status(200).json({ token: authToken, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('JWT_SECRET')) {
      return res.status(500).json({ error: 'JWT_SECRET is not configured.' });
    }
    if (msg.includes('password_reset_tokens')) {
      return res.status(503).json({
        error: 'Database schema is out of date. Run pnpm db:migrate against this deployment.',
      });
    }
    return res.status(500).json({ error: 'Could not reset password' });
  }
}
