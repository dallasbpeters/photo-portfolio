import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

let ran = false;

/**
 * On Vercel Production, env comes only from the dashboard.
 * Everywhere else (vercel dev, preview), merge project files from disk so DATABASE_URL / JWT_SECRET
 * match what `pnpm db:seed` and `pnpm db:add-user` use — Vercel-injected vars alone often pointed at a different DB.
 */
export const bootstrapEnv = (): void => {
  if (ran) {
    return;
  }
  ran = true;
  const prod = process.env.VERCEL_ENV === "production";
  const vercelDev = process.env.VERCEL_DEV === "1";
  if (prod && !vercelDev) {
    return;
  }

  // override: true so local .env files win over Vercel-injected vars during
  // `vercel dev` — Vercel often injects a different DB URL than the one in
  // .env.development.local, causing connections to the wrong host.
  const cwd = process.cwd();
  const names = [".env", ".env.local", ".env.development.local"];

  // Last, and so winning: the file belonging to the site being run.
  //
  // Each site has its own database, blob store and keys, and they all live in
  // one checkout — so running dallas locally has to read dallas's variables
  // rather than whatever `.env.local` was last pulled. `pnpm dev` sets
  // VITE_SITE; SITE is the fallback for anything started by hand.
  const site = (process.env.VITE_SITE ?? process.env.SITE)?.trim();
  if (site) {
    names.push(`.env.${site}.local`);
  }

  for (const name of names) {
    const path = resolve(cwd, name);
    if (existsSync(path)) {
      config({ override: true, path });
    }
  }
};
