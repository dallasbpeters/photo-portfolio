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

  const counts = await client.query<{ label: string; n: number }>(`
    SELECT 'photos' AS label, count(*)::int AS n FROM photos
    UNION ALL SELECT 'users', count(*)::int FROM users
    UNION ALL SELECT 'site_settings', count(*)::int FROM site_settings
    ORDER BY label
  `);

  const sites = await client.query<{ site_key: string }>(
    "SELECT site_key FROM site_settings ORDER BY site_key"
  );

  process.stdout.write(
    [
      "",
      `  host              ${hostname}`,
      `  database          ${pathname.replace("/", "")}`,
      `  user              ${username}`,
      `  system_identifier ${id}`,
      "",
      ...counts.rows.map((r) => `  ${r.label.padEnd(17)} ${r.n}`),
      `  site keys         ${sites.rows.map((r) => r.site_key).join(", ") || "none"}`,
      "",
      "  Two connection strings reporting the same system_identifier are the",
      "  same database. Compare before running anything destructive.",
      "",
    ].join("\n")
  );
} finally {
  await client.end();
}
