import { bootstrapEnv } from "./bootstrapEnv.js";

/**
 * The Lightroom credentials as the *environment* has them.
 *
 * A fallback, not the primary source — see lightroomConfig.ts, which reads the
 * database first. These are kept because a deployment that already sets them
 * should keep working, and because somebody who would rather an OAuth secret
 * never sat in a database row can still put it here.
 *
 * Separate from config/lightroom.ts because that module is dependency-free by
 * construction — the vitest config says so, and it is what lets the shared
 * constants be read by the browser and tested alongside the rest of config/.
 * Reading `process.env` and touching the filesystem to bootstrap it are both
 * things only a function can do, so they live here.
 *
 * **Read lazily, and safe to import anywhere.** These were constants evaluated
 * at module load, which meant importing anything downstream of them — the
 * transport client, and so the catalogue parser — executed `bootstrapEnv()` and
 * touched `process`. That is fine in a function and fatal in the browser the
 * tests run in, so the parsing this integration most needs covered was the one
 * part that could not be. Now nothing happens until a value is asked for, and
 * asking where there is no `process` answers empty rather than throwing: a
 * browser has no deployment secrets, which makes "" the honest answer.
 */

let bootstrapped = false;

/** The environment, or an empty one where there is none to read. */
const env = (): Record<string, string | undefined> => {
  if (typeof process === "undefined") {
    return {};
  }
  if (!bootstrapped) {
    bootstrapEnv();
    bootstrapped = true;
  }
  return process.env;
};

const read = (name: string): string => env()[name]?.trim() ?? "";

export const envClientId = (): string => read("ADOBE_CLIENT_ID");

export const envClientSecret = (): string => read("ADOBE_CLIENT_SECRET");

export const envRedirectUri = (): string => read("ADOBE_REDIRECT_URI");
