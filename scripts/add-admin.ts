/**
 * Creates an admin account on a specific database.
 *
 * Unlike db:add-user this never overwrites an existing account's password — an
 * accidental re-run must not lock the real owner out. Pass FORCE_RESET=1 to
 * deliberately reset an existing password.
 *
 * The password is generated here and never printed: the new admin sets their own
 * through "Forgot password?", or signs in with Google if their address is
 * verified there. Nothing sensitive ends up in a shell history or a transcript.
 *
 *   TARGET_DATABASE_URL='postgres://…' NEW_ADMIN_EMAIL='you@example.com' \
 *   pnpm tsx scripts/add-admin.ts
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

const connectionString = process.env.TARGET_DATABASE_URL?.trim();
const email = (process.env.NEW_ADMIN_EMAIL ?? "").trim().toLowerCase();
const forceReset = process.env.FORCE_RESET === "1";

if (!connectionString) {
  throw new Error("TARGET_DATABASE_URL is required");
}
if (!email) {
  throw new Error("NEW_ADMIN_EMAIL is required");
}

const client = new pg.Client({ connectionString });
await client.connect();

try {
  const existing = await client.query<{ id: string; created_at: Date }>(
    "SELECT id, created_at FROM users WHERE email = $1 LIMIT 1",
    [email]
  );

  if (existing.rows.length > 0 && !forceReset) {
    console.log(
      `Already an admin: ${email} (since ${String(existing.rows[0]?.created_at).slice(0, 10)}) — left untouched.`
    );
  } else {
    // Long random secret the user never needs: they claim the account by email
    // or through Google.
    const placeholder = randomBytes(32).toString("base64url");
    await client.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [email, bcrypt.hashSync(placeholder, 10)]
    );
    console.log(
      existing.rows.length > 0
        ? `Reset password for ${email} to an unknown value — use "Forgot password?" to set one.`
        : `Created admin ${email}. Set a password via "Forgot password?", or sign in with Google.`
    );
  }

  const all = await client.query<{ email: string }>(
    "SELECT email FROM users ORDER BY created_at"
  );
  console.log(
    `Admins on this database: ${all.rows.map((r) => r.email).join(", ")}`
  );
} finally {
  await client.end();
}
