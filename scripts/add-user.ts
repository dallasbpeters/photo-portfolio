import bcrypt from "bcryptjs";
import pg from "pg";
import { loadEnv } from "./loadEnv";

/**
 * Captured before loadEnv, which loads .env.local with override: true — so an
 * inline DATABASE_URL would otherwise be replaced and the account created on
 * whichever database that file points at.
 */
const explicitDatabaseUrl = process.env.DATABASE_URL?.trim();

loadEnv();

const connectionString = explicitDatabaseUrl || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const email = (process.env.NEW_USER_EMAIL || "").trim().toLowerCase();
const password = process.env.NEW_USER_PASSWORD;

if (!email) {
  throw new Error(
    "Set NEW_USER_EMAIL (e.g. NEW_USER_EMAIL=you@example.com pnpm db:add-user)"
  );
}
if (!password || password.length < 8) {
  throw new Error("NEW_USER_PASSWORD is required (min 8 characters)");
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const passwordHash = bcrypt.hashSync(password, 10);
  await client.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [email, passwordHash]
  );
  console.log(`User upserted: ${email}`);
} finally {
  await client.end();
}
