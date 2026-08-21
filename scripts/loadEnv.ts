import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Loads the env files, without overwriting anything the caller set explicitly.
 *
 * The files override each other — later beats earlier, the same rough order
 * Vite uses — but a variable already present in the real environment beats all
 * of them. `DATABASE_URL=… pnpm db:migrate` has to migrate the database it
 * names: before this, .env.local silently replaced it, so a migration aimed at
 * a new site ran against the local one, reported success, and left the intended
 * database empty. The same trap applied to db:add-user and db:seed, where it
 * would have written rows into the wrong database.
 */
export const loadEnv = (): void => {
  // Snapshotted before anything loads, since that is the only way to tell a
  // value passed on the command line from one a file supplied.
  const explicit = new Map(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );

  config({ path: join(root, ".env") });
  config({ override: true, path: join(root, ".env.local"), quiet: true });
  config({
    override: true,
    path: join(root, ".env.development.local"),
    quiet: true,
  });

  // The site's own file last, so `SITE=dallas pnpm db:migrate` migrates
  // dallas's database rather than whichever one `.env.local` happens to name.
  // Read from the snapshot: SITE has to be the one the caller asked for, not
  // one a file just supplied, or this would pick its own file.
  const site = (explicit.get("SITE") ?? explicit.get("VITE_SITE"))?.trim();
  if (site) {
    config({
      override: true,
      path: join(root, `.env.${site}.local`),
      quiet: true,
    });
  }

  for (const [key, value] of explicit) {
    process.env[key] = value;
  }
};
