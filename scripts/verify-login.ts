/**
 * Check that an email exists in the DB pointed at by DATABASE_URL and that the password matches the stored hash.
 * Does not hit the HTTP API — only Postgres + bcrypt (same as add-user / login).
 *
 * VERIFY_EMAIL=you@example.com VERIFY_PASSWORD='your-password' pnpm db:verify-login
 */
import bcrypt from "bcryptjs";
import pg from "pg";
import { loadEnv } from "./loadEnv";

loadEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const email = (process.env.VERIFY_EMAIL || "").trim().toLowerCase();
const password = process.env.VERIFY_PASSWORD;

if (!email || password === undefined || password === "") {
  throw new Error("Set VERIFY_EMAIL and VERIFY_PASSWORD");
}

const redacted = connectionString.replace(/:([^:@/]+)@/, ":***@");
console.log("Database:", redacted);
console.log("Checking user:", email);

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const { rows } = await client.query<{
    id: string;
    password_hash: string | null;
  }>("SELECT id, password_hash FROM users WHERE email = $1 LIMIT 1", [email]);

  if (rows.length === 0) {
    const { rows: all } = await client.query<{ email: string }>(
      "SELECT email FROM users ORDER BY email LIMIT 20"
    );
    console.error(
      "No row for that email. Existing users (up to 20):",
      all.map((r) => r.email).join(", ") || "(none)"
    );
    process.exit(1);
  }

  const hash = rows[0]?.password_hash;
  if (!hash) {
    console.error("User row has empty password_hash.");
    process.exit(1);
  }

  const ok = bcrypt.compareSync(password, hash);
  if (ok) {
    console.log(
      "OK — password matches this database. If the site still rejects login, the API is using a different DATABASE_URL than this script (check Vercel project env vs .env.development.local)."
    );
    process.exit(0);
  }

  console.error(
    "Password does NOT match the hash in this database. Re-run: NEW_USER_EMAIL=... NEW_USER_PASSWORD=... pnpm db:add-user"
  );
  process.exit(1);
} finally {
  await client.end();
}
