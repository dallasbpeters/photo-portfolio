/**
 * Says which database you are actually pointed at.
 *
 * This exists because "the development database" turned out to be production.
 * The connection strings differed — different passwords — so they looked like
 * two databases, and a destructive statement aimed at what looked like a
 * scratch copy ran against live data.
 *
 * `system_identifier` is the only honest answer to "is this the same
 * database". It comes from the Postgres control file and is unique per
 * instance, so two connection strings reporting the same one are the same
 * database however different the URLs look.
 *
 *   pnpm db:info                      # whatever the env resolves to
 *   DATABASE_URL='...' pnpm db:info   # a specific one
 */
import pg from "pg";
import { loadEnv } from "./loadEnv";

const explicit = process.env.DATABASE_URL?.trim();
loadEnv();

const connectionString =
  explicit ||
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim();

if (!connectionString) {
  throw new Error("No DATABASE_URL / POSTGRES_URL found.");
}

const { hostname, pathname, username } = new URL(connectionString);

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const [{ system_identifier: id }] = (
    await client.query("SELECT system_identifier FROM pg_control_system()")
  ).rows as { system_identifier: string }[];

  // Counted one table at a time, tolerating absence. A fresh Neon branch has
  // no schema yet, and "which database is this" has to be answerable before
  // the migrations have run — that is exactly when you most need to check.
  const countOf = async (table: string): Promise<string> => {
    try {
      const r = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table}`
      );
      return String(r.rows[0]?.n ?? 0);
    } catch {
      return "— (table missing)";
    }
  };

  const counts = [
    { label: "photos", n: await countOf("photos") },
    { label: "site_settings", n: await countOf("site_settings") },
    { label: "users", n: await countOf("users") },
  ];

  let siteKeys = "— (table missing)";
  try {
    const r = await client.query<{ site_key: string }>(
      "SELECT site_key FROM site_settings ORDER BY site_key"
    );
    siteKeys = r.rows.map((x) => x.site_key).join(", ") || "none";
  } catch {
    // Left as the placeholder above.
  }

  process.stdout.write(
    [
      "",
      `  host              ${hostname}`,
      `  database          ${pathname.replace("/", "")}`,
      `  user              ${username}`,
      `  system_identifier ${id}`,
      "",
      ...counts.map((r) => `  ${r.label.padEnd(17)} ${r.n}`),
      `  site keys         ${siteKeys}`,
      "",
      "  Two connection strings reporting the same system_identifier are the",
      "  same database. Compare before running anything destructive.",
      "",
    ].join("\n")
  );
} finally {
  await client.end();
}
