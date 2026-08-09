import { randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { isOwner } from "../_lib/owner.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import {
  connectStore,
  createBlobStore,
  type EnvVar,
  isVercelConfigured,
  listProjectEnvKeys,
  listStores,
  setEnvVars,
} from "../_lib/vercelApi.js";

const ALL_TARGETS: EnvVar["target"] = ["production", "preview", "development"];

const POSTGRES_URL = /^postgres(ql)?:\/\//i;

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
 * Finishes standing a site up: storage and secrets.
 *
 * Split from creating the project because these steps are re-runnable and the
 * project is not. A site created before this existed can be brought up to date
 * by pointing this at it, and running it twice is harmless — existing variables
 * are left alone rather than rotated, since replacing JWT_SECRET would sign
 * every admin out.
 *
 * What it cannot do is create the database. Vercel's Postgres endpoint answers
 * 410 and its Neon replacement is a marketplace integration with no API to
 * create one, so the connection string is passed in and set from here.
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

    if (databaseUrl) {
      vars.push({
        key: "DATABASE_URL",
        target: ALL_TARGETS,
        value: databaseUrl,
      });
      done.push("Set DATABASE_URL");
    } else if (!existing.has("DATABASE_URL")) {
      remaining.push(
        "Create a database (Neon) and re-run this with its connection string"
      );
    }

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
