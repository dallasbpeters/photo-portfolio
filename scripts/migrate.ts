import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnv } from "./loadEnv";

/**
 * Captured before loadEnv, which loads .env.local with override: true.
 *
 * Without this, `DATABASE_URL=… pnpm db:migrate` silently migrated whatever
 * .env.local pointed at instead of the database named on the command line —
 * so a migration aimed at one database landed on another.
 */
const explicitDatabaseUrl = process.env.DATABASE_URL?.trim();

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const connectionString =
  explicitDatabaseUrl ||
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim();
if (!connectionString) {
  throw new Error(
    "DATABASE_URL (or POSTGRES_URL / POSTGRES_PRISMA_URL) is required (Neon connection string in .env, .env.local, or .env.development.local)"
  );
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const schemaSql = readFileSync(join(root, "db/schema.sql"), "utf8");
  await client.query(schemaSql);
  console.log("Applied db/schema.sql");

  // Every patch is idempotent, so applying all of them in filename order is safe
  // to re-run. Adding a patch means dropping a file in db/patches — no edit here.
  const patchDir = join(root, "db/patches");
  const patches = readdirSync(patchDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of patches) {
    // biome-ignore lint/performance/noAwaitInLoops: patches must apply in filename order; a later one may depend on an earlier one
    await client.query(readFileSync(join(patchDir, file), "utf8"));
    console.log(`Applied db/patches/${file}`);
  }

  console.log(`Migration finished (${patches.length} patches).`);
} finally {
  await client.end();
}
