import type { getSql } from "./db.js";
import {
  envClientId,
  envClientSecret,
  envRedirectUri,
} from "./lightroomEnv.js";

type Sql = ReturnType<typeof getSql>;

/**
 * The Adobe integration's credentials: what they are and where they came from.
 *
 * Read from the database first and the environment second. That order is the
 * point of this module — the credentials are entered in the admin because the
 * person who can obtain them is the one running the app, not the one deploying
 * it, and requiring a redeploy to paste a client id was the wrong shape for a
 * value that arrives from an approval process weeks after the code ships.
 *
 * The environment is kept as a fallback rather than removed. Somebody who would
 * rather their secret never sat in a row can still set ADOBE_CLIENT_SECRET, and
 * a deployment that already has these set keeps working with no migration step.
 * `source` says which won, because "I set that and it is not being used" is
 * otherwise an unanswerable question.
 */

export interface LightroomCredentials {
  clientId: string;
  clientSecret: string;
  /** Where Adobe sends the browser back. Must match the console exactly. */
  redirectUri: string;
  /**
   * Whether the redirect URI was chosen or merely defaulted.
   *
   * The resolved value is never empty, so the panel cannot otherwise tell a
   * deliberate URI from the compiled-in fallback — and it wants to offer the
   * origin it is being viewed from when nobody has chosen one.
   */
  redirectUriSource: "database" | "default" | "environment";
  /** Which store each half came from, for the panel to report. */
  source: {
    clientId: "database" | "environment" | "none";
    clientSecret: "database" | "environment" | "none";
  };
}

interface CredentialsRow {
  client_id: string | null;
  client_secret: string | null;
  redirect_uri: string | null;
}

/**
 * The default callback, used when neither the row nor the environment names one.
 *
 * A compiled-in production URL, deliberately: this is a *fallback*, and guessing
 * from a request host would let a proxy or a preview deployment quietly change
 * the value Adobe has to match. The panel offers the current origin instead,
 * where a person can see what they are agreeing to before saving it.
 */
export const defaultRedirectUri = (): string =>
  envRedirectUri() || "https://dallaspeters.com/api/lightroom/callback";

const pick = (
  fromDb: string | null,
  fromEnv: string
): { source: "database" | "environment" | "none"; value: string } => {
  const db = fromDb?.trim();
  if (db) {
    return { source: "database", value: db };
  }
  return fromEnv
    ? { source: "environment", value: fromEnv }
    : { source: "none", value: "" };
};

const redirectUriSource = (
  fromDb: string,
  fromEnv: string
): LightroomCredentials["redirectUriSource"] => {
  if (fromDb) {
    return "database";
  }
  return fromEnv ? "environment" : "default";
};

export const loadCredentials = async (
  sql: Sql
): Promise<LightroomCredentials> => {
  /*
   * Tolerant of a database that has not run patch 034.
   *
   * The same reasoning withElements gives: a missing relation would otherwise
   * fail every Lightroom route including the status one, so the panel could not
   * even say what was wrong. Falling back to the environment costs one failed
   * query on a database that has not caught up.
   */
  const rows = (await sql`
    SELECT client_id, client_secret, redirect_uri
    FROM lightroom_credentials WHERE id = 1
  `.catch(() => [])) as CredentialsRow[];
  const row = rows[0] ?? {
    client_id: null,
    client_secret: null,
    redirect_uri: null,
  };

  const id = pick(row.client_id, envClientId());
  const secret = pick(row.client_secret, envClientSecret());

  const storedUri = row.redirect_uri?.trim() ?? "";
  const envUri = envRedirectUri();
  return {
    clientId: id.value,
    clientSecret: secret.value,
    redirectUri: storedUri || envUri || defaultRedirectUri(),
    redirectUriSource: redirectUriSource(storedUri, envUri),
    source: { clientId: id.source, clientSecret: secret.source },
  };
};

/** Whether a handshake can even be started. */
export const isConfigured = (credentials: LightroomCredentials): boolean =>
  Boolean(credentials.clientId && credentials.clientSecret);

/**
 * Which half is missing, for a message worth reading.
 *
 * Named rather than "not configured" because the two are obtained at different
 * moments — the id is visible in the console immediately, the secret has to be
 * generated and copied once — so "which one did I forget" is the actual
 * question.
 */
export const missingHalf = (
  credentials: LightroomCredentials
): string | null => {
  if (credentials.clientId && credentials.clientSecret) {
    return null;
  }
  if (!(credentials.clientId || credentials.clientSecret)) {
    return "the client ID and secret";
  }
  return credentials.clientId ? "the client secret" : "the client ID";
};

/**
 * Writes the credentials, leaving out what was not sent.
 *
 * A blank secret means "keep the one you have", not "clear it" — the panel never
 * receives the stored secret, so it cannot send it back, and treating an empty
 * field as a deletion would wipe the secret every time somebody corrected a typo
 * in the client id. Clearing is a separate, deliberate act; see `clearSecret`.
 */
export const saveCredentials = async (
  sql: Sql,
  userId: string,
  next: { clientId?: string; clientSecret?: string; redirectUri?: string }
): Promise<void> => {
  const clientId = next.clientId?.trim() ?? null;
  const clientSecret = next.clientSecret?.trim() ?? null;
  const redirectUri = next.redirectUri?.trim() ?? null;

  await sql`
    INSERT INTO lightroom_credentials
      (id, client_id, client_secret, redirect_uri, updated_by)
    VALUES (1, ${clientId}, ${clientSecret}, ${redirectUri}, ${userId})
    ON CONFLICT (id) DO UPDATE SET
      /* COALESCE on each half: a field the panel did not send keeps its stored
         value. Only the secret is genuinely invisible to the client, but the
         same rule for all three means a partial save is never a partial wipe. */
      client_id = COALESCE(EXCLUDED.client_id, lightroom_credentials.client_id),
      client_secret =
        COALESCE(EXCLUDED.client_secret, lightroom_credentials.client_secret),
      redirect_uri =
        COALESCE(EXCLUDED.redirect_uri, lightroom_credentials.redirect_uri),
      updated_at = now(),
      updated_by = EXCLUDED.updated_by
  `;
};

/**
 * Forgets the stored credentials.
 *
 * Deletes the row rather than blanking it, so the environment fallback comes
 * back into play — blanking would leave a row whose empty strings COALESCE
 * cannot distinguish from "not set", and the panel would report "not
 * configured" on a deployment that has perfectly good env vars.
 */
export const clearCredentials = async (sql: Sql): Promise<void> => {
  await sql`DELETE FROM lightroom_credentials WHERE id = 1`;
};
