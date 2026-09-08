import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle's own configuration, used by `drizzle-kit` on the command line.
 *
 * The running app never reads this — it builds its client in db/client.ts. This
 * exists so `drizzle-kit pull` can regenerate db/schema.ts from a real database
 * after a patch lands in db/patches.
 *
 * Migrations stay in db/patches and keep running through `pnpm db:migrate`.
 * Drizzle is being introduced as a typed query layer over the schema we already
 * have, not as its owner: three deployed databases are already built by those
 * patches, and handing schema authority to a second tool would leave two things
 * able to disagree about the same tables.
 *
 * Point it at a specific site with DATABASE_URL, the way the migration script
 * is pointed:
 *   DATABASE_URL="$(...)" pnpm db:pull
 */
for (const file of [".env", ".env.local", ".env.development.local"]) {
  config({ override: false, path: file, quiet: true });
}

export default defineConfig({
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      process.env.POSTGRES_URL ??
      process.env.POSTGRES_PRISMA_URL ??
      "",
  },
  dialect: "postgresql",
  // Introspection writes here; db/patches remains the source of truth for DDL.
  out: "./db",
  schema: "./db/schema.ts",
});
