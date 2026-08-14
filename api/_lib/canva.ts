import { createHash, randomBytes } from "node:crypto";
import {
  CANVA_API,
  CANVA_CLIENT_ID,
  CANVA_CLIENT_SECRET,
  CANVA_SCOPES,
  CANVA_TOKEN_URL,
} from "../../config/canva.js";
import type { getSql } from "./db.js";

type Sql = ReturnType<typeof getSql>;

/**
 * The Canva Connect integration: OAuth tokens, asset upload and design autofill.
 *
 * Everything here talks to api.canva.com on behalf of the connected admin. The
 * browser never sees a Canva token — it is stored per user in canva_tokens and
 * refreshed just before use, so a send is one round trip to our own API.
 */

/** The token pair Canva hands back after an OAuth exchange or refresh. */
interface CanvaTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

interface CanvaRow {
  access_token: string;
  expires_at: string;
  refresh_token: string;
}

const basicAuth = (): string =>
  `Basic ${Buffer.from(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`).toString("base64")}`;

/** A fresh PKCE verifier, and the S256 challenge derived from it. */
export const pkcePair = (): { challenge: string; verifier: string } => {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { challenge, verifier };
};

/** The URL to send the admin to for the OAuth handshake. */
export const authorizeUrl = (state: string, challenge: string): string => {
  const params = new URLSearchParams({
    client_id: CANVA_CLIENT_ID,
    code_challenge: challenge,
    code_challenge_method: "S256",
    response_type: "code",
    scope: CANVA_SCOPES,
    state,
  });
  return `https://www.canva.com/api/oauth/authorize?${params.toString()}`;
};

/** Exchanges an authorisation code for tokens. */
export const exchangeCode = (
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<CanvaTokens> => {
  const body = new URLSearchParams({
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  return tokenRequest(body);
};

/** Refreshes an expired access token with the stored refresh token. */
export const refreshAccessToken = (
  refreshToken: string
): Promise<CanvaTokens> => {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return tokenRequest(body);
};

const tokenRequest = async (body: URLSearchParams): Promise<CanvaTokens> => {
  const res = await fetch(CANVA_TOKEN_URL, {
    body,
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    expires_in?: number;
    message?: string;
    refresh_token?: string;
  };
  if (!(res.ok && json.access_token)) {
    throw new Error(
      json.message ??
        json.error ??
        `Canva token exchange failed (${res.status})`
    );
  }
  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in ?? 14_400,
    refreshToken: json.refresh_token ?? "",
  };
};

export const saveTokens = async (
  sql: Sql,
  userId: string,
  tokens: CanvaTokens
): Promise<void> => {
  await sql`
    INSERT INTO canva_tokens (user_id, access_token, refresh_token, expires_at)
    VALUES (${userId}, ${tokens.accessToken}, ${tokens.refreshToken},
            now() + (${tokens.expiresIn} || ' seconds')::interval)
    ON CONFLICT (user_id) DO UPDATE
    SET access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_at = EXCLUDED.expires_at,
        updated_at = now()
  `;
};

export const clearTokens = async (sql: Sql, userId: string): Promise<void> => {
  await sql`DELETE FROM canva_tokens WHERE user_id = ${userId}`;
};

/**
 * A usable access token for the user, refreshing (and storing) when the stored
 * one has expired. Returns null when the user has never connected.
 */
export const usableToken = async (
  sql: Sql,
  userId: string
): Promise<string | null> => {
  const rows = (await sql`
    SELECT access_token, refresh_token, expires_at
    FROM canva_tokens WHERE user_id = ${userId}
  `) as CanvaRow[];
  const [stored] = rows;
  if (!stored) {
    return null;
  }
  // Refreshed a little early rather than exactly on the wire: Canva's clock is
  // not ours, and a request that lands after expiry is a failed send.
  const fresh = Date.parse(stored.expires_at) - Date.now() > 60_000;
  if (fresh) {
    return stored.access_token;
  }
  const refreshed = await refreshAccessToken(stored.refresh_token);
  await saveTokens(sql, userId, refreshed);
  return refreshed.accessToken;
};

export const hasToken = async (sql: Sql, userId: string): Promise<boolean> =>
  (await usableToken(sql, userId)) !== null;

/** Calls one Connect API path with the user's token. */
const canvaFetch = async (
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<unknown> => {
  const res = await fetch(`${CANVA_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    message?: string;
  };
  if (!res.ok) {
    throw new Error(
      json.error?.message ?? json.message ?? `Canva answered ${res.status}`
    );
  }
  return json;
};

interface CanvaJob {
  asset?: { id: string };
  error?: { code?: string; message?: string };
  id: string;
  result?: { design?: { url: string; id: string } };
  status: string;
}

/**
 * Polls an asynchronous job until it settles.
 *
 * Both upload and autofill are jobs: the create call returns a job id, and the
 * result only appears once the job reports success. One second between probes,
 * well under any reasonable generation time.
 */
const pollJob = async (
  token: string,
  getPath: (jobId: string) => string,
  jobId: string,
  attempts = 30
): Promise<CanvaJob> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: the whole point of polling is one probe per tick — the loop is the poll
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const job = (await canvaFetch(token, getPath(jobId))) as CanvaJob;
    if (job.status === "success") {
      return job;
    }
    if (job.status === "failed") {
      throw new Error(job.error?.message ?? "The Canva job failed");
    }
  }
  throw new Error("Canva took too long to finish the job");
};

/** Uploads an image by URL into the user's Canva asset library. */
export const uploadAsset = async (
  token: string,
  imageUrl: string,
  name: string
): Promise<string> => {
  const created = (await canvaFetch(token, "/url-asset-uploads", {
    body: JSON.stringify({ name, url: imageUrl }),
    method: "POST",
  })) as CanvaJob;
  const job = await pollJob(
    token,
    (id) => `/url-asset-uploads/${id}`,
    created.id
  );
  return job.asset?.id ?? "";
};

/**
 * Fills the chosen image field of a brand template with an uploaded asset,
 * producing a new design. Returns the permanent design URL.
 */
export const autofillDesign = async (
  token: string,
  brandTemplateId: string,
  fieldKey: string,
  assetId: string,
  title: string
): Promise<string> => {
  const created = (await canvaFetch(token, "/autofills", {
    body: JSON.stringify({
      brand_template_id: brandTemplateId,
      data: { [fieldKey]: { asset_id: assetId, type: "image" } },
      type: "create_from_brand_template",
      ...(title ? { title } : {}),
    }),
    method: "POST",
  })) as CanvaJob;
  const job = await pollJob(token, (id) => `/autofills/${id}`, created.id);
  return job.result?.design?.url ?? "";
};

export interface CanvaTemplate {
  id: string;
  thumbnail: { height: number; url: string; width: number } | null;
  title: string;
  viewUrl: string;
}

/** The admin's autofillable brand templates. */
export const listBrandTemplates = async (
  token: string
): Promise<CanvaTemplate[]> => {
  const json = (await canvaFetch(
    token,
    "/brand-templates?dataset=non_empty"
  )) as {
    items?: {
      id: string;
      thumbnail?: { height?: number; url?: string; width?: number };
      title?: string;
      view_url?: string;
    }[];
  };
  return (json.items ?? []).map((item) => ({
    id: item.id,
    thumbnail: item.thumbnail?.url
      ? {
          height: item.thumbnail.height ?? 0,
          url: item.thumbnail.url,
          width: item.thumbnail.width ?? 0,
        }
      : null,
    title: item.title ?? "Untitled template",
    viewUrl: item.view_url ?? "",
  }));
};

/** The autofillable image field names of a brand template. */
export const brandTemplateImageFields = async (
  token: string,
  brandTemplateId: string
): Promise<string[]> => {
  const json = (await canvaFetch(
    token,
    `/brand-templates/${brandTemplateId}/dataset`
  )) as { dataset?: Record<string, { type?: string }> };
  const dataset = json.dataset ?? {};
  return Object.entries(dataset)
    .filter(([, field]) => field.type === "image")
    .map(([name]) => name);
};
