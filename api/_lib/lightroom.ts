import { createHash, randomBytes } from "node:crypto";
import {
  ADOBE_AUTHORIZE_URL,
  ADOBE_TOKEN_URL,
  LIGHTROOM_API,
  LIGHTROOM_SCOPES,
} from "../../config/lightroom.js";
import type { getSql } from "./db.js";
import {
  adobeClientId,
  adobeClientSecret,
  adobeRedirectUri,
} from "./lightroomEnv.js";

type Sql = ReturnType<typeof getSql>;

/**
 * The Adobe Lightroom integration: OAuth tokens, and a client for lr.adobe.io.
 *
 * Everything here talks to Adobe on behalf of the connected admin. The browser
 * never sees an Adobe token — it is stored per user in lightroom_tokens and
 * refreshed just before use, so an import is one round trip to our own API.
 *
 * Two things about this API are unusual enough to be worth knowing before
 * reading the code. Its JSON responses are prefixed with `while (1) {}`, and
 * every request needs the client id as an `X-API-Key` header *in addition to*
 * the bearer token. Both are handled in `lrFetch`, once.
 */

/** The token pair Adobe IMS hands back from an exchange or a refresh. */
export interface AdobeTokens {
  accessToken: string;
  expiresIn: number;
  /** Absent unless `offline_access` was granted. See patch 033. */
  refreshToken: string | null;
}

interface TokenRow {
  access_token: string;
  account_email: string | null;
  catalog_id: string | null;
  expires_at: string;
  refresh_token: string | null;
}

/**
 * A fresh PKCE verifier and its S256 challenge.
 *
 * Used even though this is a confidential client with a secret. IMS accepts it,
 * it costs one hash, and it means an intercepted authorisation code is not on
 * its own enough to obtain a token. The same pair Canva's flow generates.
 */
export const pkcePair = (): { challenge: string; verifier: string } => {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { challenge, verifier };
};

/** The URL to send the admin to for Adobe's consent screen. */
export const authorizeUrl = (state: string, challenge: string): string => {
  const params = new URLSearchParams({
    client_id: adobeClientId(),
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: adobeRedirectUri(),
    response_type: "code",
    scope: LIGHTROOM_SCOPES,
    state,
  });
  return `${ADOBE_AUTHORIZE_URL}?${params.toString()}`;
};

/** Reads a token response, whichever of the two shapes IMS answers with. */
const readTokens = async (
  res: Response,
  what: string
): Promise<AdobeTokens> => {
  const text = await res.text();
  if (!res.ok) {
    // IMS puts the useful part in `error_description`; the status alone says
    // nothing about whether the secret is wrong or the scope was refused.
    throw new Error(
      `Adobe ${what} failed (${res.status}): ${text.slice(0, 300)}`
    );
  }
  const json = JSON.parse(text) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  if (!json.access_token) {
    throw new Error(`Adobe ${what} returned no access token`);
  }
  return {
    accessToken: json.access_token,
    // IMS reports seconds. A missing value would otherwise store an expiry of
    // "now", so every request would refresh — assume the documented day.
    expiresIn:
      typeof json.expires_in === "number" && json.expires_in > 0
        ? json.expires_in
        : 86_400,
    refreshToken: json.refresh_token ?? null,
  };
};

export const exchangeCode = async (
  code: string,
  codeVerifier: string
): Promise<AdobeTokens> => {
  const res = await fetch(ADOBE_TOKEN_URL, {
    body: new URLSearchParams({
      client_id: adobeClientId(),
      client_secret: adobeClientSecret(),
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: adobeRedirectUri(),
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  return readTokens(res, "token exchange");
};

const refreshTokens = async (refreshToken: string): Promise<AdobeTokens> => {
  const res = await fetch(ADOBE_TOKEN_URL, {
    body: new URLSearchParams({
      client_id: adobeClientId(),
      client_secret: adobeClientSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  return readTokens(res, "token refresh");
};

/** Writes the token pair, keeping a refresh token IMS chose not to resend. */
export const saveTokens = async (
  sql: Sql,
  userId: string,
  tokens: AdobeTokens,
  extra: { accountEmail?: string | null; catalogId?: string | null } = {}
): Promise<void> => {
  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
  await sql`
    INSERT INTO lightroom_tokens
      (user_id, access_token, refresh_token, expires_at, catalog_id, account_email)
    VALUES (
      ${userId}, ${tokens.accessToken}, ${tokens.refreshToken}, ${expiresAt},
      ${extra.catalogId ?? null}, ${extra.accountEmail ?? null}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      /* COALESCE, not EXCLUDED: a refresh response often omits the refresh
         token, meaning "keep using the one you have". Overwriting with NULL
         there would break the next refresh and silently reduce the integration
         to a daily reconnect. */
      refresh_token = COALESCE(EXCLUDED.refresh_token, lightroom_tokens.refresh_token),
      expires_at = EXCLUDED.expires_at,
      catalog_id = COALESCE(EXCLUDED.catalog_id, lightroom_tokens.catalog_id),
      account_email = COALESCE(EXCLUDED.account_email, lightroom_tokens.account_email),
      updated_at = now()
  `;
};

export const hasToken = async (sql: Sql, userId: string): Promise<boolean> => {
  const rows = (await sql`
    SELECT 1 FROM lightroom_tokens WHERE user_id = ${userId}
  `) as unknown[];
  return rows.length > 0;
};

export const forgetTokens = async (sql: Sql, userId: string): Promise<void> => {
  await sql`DELETE FROM lightroom_tokens WHERE user_id = ${userId}`;
};

/** The connection as the panel shows it. */
export interface LightroomConnection {
  accessToken: string;
  accountEmail: string | null;
  catalogId: string | null;
}

/**
 * How long before expiry a token is replaced.
 *
 * A minute, because the alternative is a request that starts valid and arrives
 * expired. An import loop can run for a while after this check, which is why
 * `lrFetch` also retries once on a 401 rather than trusting the clock alone.
 */
const REFRESH_MARGIN_MS = 60_000;

/**
 * The admin's live connection, refreshing the access token if it is close to
 * expiring.
 *
 * Null when they have never connected. Throws when the refresh itself fails,
 * because that is a different situation — the connection existed and has been
 * revoked or the secret has changed, and quietly reporting "not connected"
 * would send someone to reconnect without telling them why.
 */
export const connectionFor = async (
  sql: Sql,
  userId: string
): Promise<LightroomConnection | null> => {
  const rows = (await sql`
    SELECT access_token, refresh_token, expires_at, catalog_id, account_email
    FROM lightroom_tokens WHERE user_id = ${userId}
  `) as TokenRow[];
  const [row] = rows;
  if (!row) {
    return null;
  }

  const expiresAt = new Date(row.expires_at).getTime();
  const stale = Number.isFinite(expiresAt)
    ? expiresAt - Date.now() < REFRESH_MARGIN_MS
    : true;

  if (!stale) {
    return {
      accessToken: row.access_token,
      accountEmail: row.account_email,
      catalogId: row.catalog_id,
    };
  }

  if (!row.refresh_token) {
    // Expired with nothing to refresh from: `offline_access` was not granted.
    // Said plainly, because the fix is to reconnect and the cause is not the
    // admin's doing.
    throw new Error(
      "The Lightroom connection has expired and cannot renew itself — reconnect. (Long-lived access needs the offline_access scope, which Adobe grants per integration.)"
    );
  }

  const fresh = await refreshTokens(row.refresh_token);
  await saveTokens(sql, userId, fresh);
  return {
    accessToken: fresh.accessToken,
    accountEmail: row.account_email,
    catalogId: row.catalog_id,
  };
};

/**
 * The guard Lightroom puts in front of every JSON response.
 *
 * The body genuinely begins `while (1) {}` and then the JSON — a guard against
 * a response being loaded as a script. It is not mentioned in the
 * getting-started docs and it is the first thing that breaks a new client:
 * `JSON.parse` fails on a perfectly good 200.
 *
 * Matched exactly rather than by "skip to the first brace", which was the first
 * attempt and was wrong for a reason worth recording: the guard *contains* a
 * brace pair, so the generic version returned `{}` followed by the real body and
 * failed to parse at character three. Whitespace is flexible; the shape is not.
 *
 * If Adobe ever changes it, this stops matching and the caller's parse throws
 * with the real text in the message — which is the failure worth having, rather
 * than a clever strip that silently mangles a body.
 */
const JSON_GUARD = /^\s*while\s*\(\s*1\s*\)\s*\{\s*\}\s*/;

/** The response body with that guard removed. Clean JSON passes through. */
export const stripJsonGuard = (body: string): string =>
  body.replace(JSON_GUARD, "");

interface LrFetchOptions {
  /** Retried once on a 401 with a forced refresh. Internal. */
  body?: BodyInit;
  headers?: Record<string, string>;
  method?: string;
}

/**
 * One request to lr.adobe.io, with both of the things this API insists on.
 *
 * The `X-API-Key` header is required alongside the bearer token — the token says
 * who the customer is, the key says which entitled application is asking, and a
 * request missing either is a 403 that does not say which.
 */
export const lrFetch = async (
  connection: LightroomConnection,
  path: string,
  options: LrFetchOptions = {}
): Promise<Response> =>
  fetch(`${LIGHTROOM_API}${path}`, {
    body: options.body,
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      "X-API-Key": adobeClientId(),
      ...options.headers,
    },
    method: options.method ?? "GET",
  });

/** A `lrFetch` whose JSON body is read, guard stripped, and errors raised. */
export const lrJson = async <T>(
  connection: LightroomConnection,
  path: string,
  options: LrFetchOptions = {}
): Promise<T> => {
  const res = await lrFetch(connection, path, options);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Lightroom ${path} failed (${res.status}): ${stripJsonGuard(text).slice(0, 300)}`
    );
  }
  return JSON.parse(stripJsonGuard(text)) as T;
};
