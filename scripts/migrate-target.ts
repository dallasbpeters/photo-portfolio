/**
 * Runs the same migration as `pnpm db:migrate` against an explicitly supplied
 * database instead of the one in the local env files.
 *
 * Needed because loadEnv() calls dotenv with `override: true`, so a DATABASE_URL
 * exported on the command line would be clobbered by .env.local. Use a distinct
 * variable that nothing else writes:
 *
 *   TARGET_DATABASE_URL='postgres://…' pnpm tsx scripts/migrate-target.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const connectionString = process.env.TARGET_DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("TARGET_DATABASE_URL is required");
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = new pg.Client({ connectionString });
await client.connect();

try {
  console.log("Target:", connectionString.replace(/:([^:@/]+)@/, ":***@"));
  await client.query(readFileSync(join(root, "db/schema.sql"), "utf8"));
  console.log("Applied db/schema.sql");

  const patchDir = join(root, "db/patches");
  const patches = readdirSync(patchDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of patches) {
    await client.query(readFileSync(join(patchDir, file), "utf8"));
    console.log(`Applied db/patches/${file}`);
  }

  console.log(`Migration finished (${patches.length} patches).`);
} finally {
  await client.end();
}
