import { randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { isOwner } from "../_lib/owner.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import {
  connectStore,
  createBlobStore,
  createNeonDatabase,
  type EnvVar,
  isVercelConfigured,
  listProjectEnvKeys,
  listStores,
  neonConfigurationId,
  setEnvVars,
} from "../_lib/vercelApi.js";

const ALL_TARGETS: EnvVar["target"] = ["production", "preview", "development"];

const POSTGRES_URL = /^postgres(ql)?:\/\//i;

/**
 * Credentials every site shares, copied from this deployment's own environment.
 *
 * They cannot be read back off another Vercel project — the API returns an
 * encrypted blob or nothing at all — but the admin doing the provisioning is
 * itself a site and already holds them, so it passes on what it has.
 *
 * Google is the reason this matters most: the sign-in button renders nothing
 * without VITE_GOOGLE_CLIENT_ID, so a new site silently has no Google login.
 * One OAuth client serves every site; what it cannot do is authorise the new
 * domain, which has no API and stays a manual step in Google Cloud Console.
 *
 * Deliberately excludes anything per-site: DATABASE_URL, the blob variables,
 * JWT_SECRET and SITE_* all belong to one deployment and must never be shared.
 */
const SHARED_ENV = [
  "GOOGLE_CLIENT_ID",
  "VITE_GOOGLE_CLIENT_ID",
  "RESEND_API_KEY",
  "VITE_POSTHOG_KEY",
  "VITE_POSTHOG_HOST",
  "UNSPLASH_ACCESS_KEY",
  "FAL_API_KEY",
  "MAGNIFIC_API_KEY",
];

/** 32 bytes, well past the 16-character minimum the API enforces. */
const newSecret = (): string => randomBytes(32).toString("base64url");

const trimmedString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/** Answers the request and returns true when it must not go any further. */
function rejectRequest(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return true;
  }

  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return true;
  }
  if (!isOwner(user)) {
    res.status(403).json({ error: "Forbidden" });
    return true;
  }
  if (!isVercelConfigured()) {
    res
      .status(503)
      .json({ error: "Provisioning is not configured. Set VERCEL_TOKEN." });
    return true;
  }

  return false;
}

/**
 * Connects a blob store to the project and describes what it did.
 *
 * Re-runs, and a store left behind by a half-finished attempt, must not fail
 * here: store names are unique across the account, so creating blindly throws
 * the moment one already exists.
 */
async function connectBlobStore(projectId: string): Promise<string> {
  const wanted = `${projectId}-blob`.slice(0, 32);
  const stores = await listStores();
  const found = stores.find(
    (candidate) => candidate.name === wanted && candidate.type === "blob"
  );

  const store = found ?? (await createBlobStore(wanted));
  await connectStore(store.id, projectId);
  return found
    ? `Connected existing blob store ${store.name}`
    : `Created and connected blob store ${store.name}`;
}

/**
 * Settles what DATABASE_URL should be, recording what happened.
 *
 * A connection string handed in wins, since it is the only way to point a site
 * at a database that already exists. Otherwise a Neon database is created
 * through the marketplace integration and connected, which is what makes Vercel
 * inject the connection string — so nothing is set by hand on that path.
 *
 * Like the blob store, this has to survive a re-run: store names are unique
 * across the account, so an existing one is connected rather than recreated.
 */
async function ensureDatabase(
  site: { databaseUrl: string; existing: Set<string>; projectId: string },
  report: { done: string[]; remaining: string[]; vars: EnvVar[] }
): Promise<void> {
  if (site.databaseUrl) {
    report.vars.push({
      key: "DATABASE_URL",
      target: ALL_TARGETS,
      value: site.databaseUrl,
    });
    report.done.push("Set DATABASE_URL");
    return;
  }

  if (site.existing.has("DATABASE_URL")) {
    report.done.push("DATABASE_URL already set");
    return;
  }

  const configurationId = await neonConfigurationId();
  if (!configurationId) {
    report.remaining.push(
      "Install the Neon integration, then re-run this — or re-run it with a connection string"
    );
    return;
  }

  const wanted = `${site.projectId}-db`.slice(0, 32);
  const stores = await listStores();
  const found = stores.find(
    (candidate) => candidate.name === wanted && candidate.type !== "blob"
  );

  const store =
    found ?? (await createNeonDatabase({ configurationId, name: wanted }));
  await connectStore(store.id, site.projectId);
  report.done.push(
    found
      ? `Connected existing database ${store.name}`
      : `Created and connected database ${store.name}`
  );
}

/**
 * Finishes standing a site up: storage and secrets.
 *
 * Split from creating the project because these steps are re-runnable and the
 * project is not. A site created before this existed can be brought up to date
 * by pointing this at it, and running it twice is harmless — existing variables
 * are left alone rather than rotated, since replacing JWT_SECRET would sign
 * every admin out.
 *
 * The database is created through the Neon marketplace integration when one is
 * not passed in, since Vercel's own Postgres endpoint answers 410. Without that
 * integration installed there is nothing to call, so it is reported as remaining
 * work rather than failing the request.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (rejectRequest(req, res)) {
    return;
  }

  const body = parseJsonBody(req.body);
  const projectId = trimmedString(body.projectId);
  const databaseUrl = trimmedString(body.databaseUrl);

  if (!projectId) {
    return res.status(400).json({ error: "A project is required" });
  }
  if (databaseUrl && !POSTGRES_URL.test(databaseUrl)) {
    return res
      .status(400)
      .json({ error: "The database URL must be a postgres connection string" });
  }

  const done: string[] = [];
  const remaining: string[] = [];

  try {
    const existing = new Set(await listProjectEnvKeys(projectId));
    const vars: EnvVar[] = [];

    // Only minted when absent. Rotating it would invalidate every session.
    if (existing.has("JWT_SECRET")) {
      done.push("JWT_SECRET already set");
    } else {
      vars.push({ key: "JWT_SECRET", target: ALL_TARGETS, value: newSecret() });
      done.push("Generated JWT_SECRET");
    }

    // Existing values are never overwritten: a site may legitimately have been
    // pointed at its own Resend or PostHog account.
    for (const key of SHARED_ENV) {
      const value = process.env[key]?.trim();
      if (value && !existing.has(key)) {
        vars.push({ key, target: ALL_TARGETS, value });
        done.push(`Copied ${key}`);
      }
    }

    await ensureDatabase(
      { databaseUrl, existing, projectId },
      { done, remaining, vars }
    );

    if (vars.length > 0) {
      await setEnvVars(projectId, vars);
    }

    // The connection is what makes Vercel inject BLOB_READ_WRITE_TOKEN, so
    // there is nothing to set by hand afterwards.
    if (existing.has("BLOB_READ_WRITE_TOKEN")) {
      done.push("Blob store already connected");
    } else {
      done.push(await connectBlobStore(projectId));
    }

    // Migrations need a client that can reach the database and the SQL files on
    // disk, so they stay a command rather than something claimed to be done.
    remaining.push(
      "Run the migrations: DATABASE_URL='…' pnpm db:migrate",
      // Google has no API for this, so it cannot be automated however much of
      // the rest is.
      "Add the site's domain to Authorized JavaScript origins in Google Cloud Console",
      "Redeploy so the new variables take effect"
    );

    return res.status(200).json({ done, remaining });
  } catch (e) {
    console.error(e);
    return res.status(502).json({
      done,
      error: e instanceof Error ? e.message : "Setup failed",
    });
  }
}
