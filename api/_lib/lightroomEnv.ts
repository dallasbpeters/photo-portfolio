import { bootstrapEnv } from "./bootstrapEnv.js";

/**
 * The Lightroom credentials, read from the environment.
 *
 * Separate from config/lightroom.ts because that module is dependency-free by
 * construction — the vitest config says so, and it is what lets the shared
 * constants be read by the browser and tested alongside the rest of config/.
 * Reading `process.env` and touching the filesystem to bootstrap it are both
 * things only a function can do, so they live here.
 *
 * (config/canva.ts keeps its env reading inline, which is why there is no test
 * beside it. This is the arrangement that should have been used there.)
 *
 * **Read lazily, and safe to import anywhere.** These were constants evaluated
 * at module load, which meant importing anything downstream of them — the
 * transport client, and so the catalogue parser — executed `bootstrapEnv()` and
 * touched `process`. That is fine in a function and fatal in the browser the
 * tests run in, so the parsing this integration most needs covered was the one
 * part that could not be. Now nothing happens until a value is actually asked
 * for, and asking where there is no `process` answers empty rather than
 * throwing: a browser has no deployment secrets, which makes "" the honest
 * answer and `isLightroomConfigured()` correctly false.
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

export const adobeClientId = (): string => read("ADOBE_CLIENT_ID");

export const adobeClientSecret = (): string => read("ADOBE_CLIENT_SECRET");

/** Publicly reachable callback, registered in the Adobe developer console. */
export const adobeRedirectUri = (): string =>
  read("ADOBE_REDIRECT_URI") ||
  "https://dallaspeters.com/api/lightroom/callback";

export const isLightroomConfigured = (): boolean =>
  Boolean(adobeClientId() && adobeClientSecret());

/**
 * Which environment variable is missing, for a message worth reading.
 *
 * Named rather than "not configured" because the two halves are obtained at
 * different moments — the id is visible in the console immediately, the secret
 * has to be generated and copied once — so "which one did I forget" is the
 * actual question.
 */
export const lightroomMissingEnv = (): string | null => {
  const id = adobeClientId();
  const secret = adobeClientSecret();
  if (id && secret) {
    return null;
  }
  if (!(id || secret)) {
    return "ADOBE_CLIENT_ID and ADOBE_CLIENT_SECRET";
  }
  return id ? "ADOBE_CLIENT_SECRET" : "ADOBE_CLIENT_ID";
};
