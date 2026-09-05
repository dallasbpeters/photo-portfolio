/**
 * Google sign-in for the desktop app, the way Google requires it.
 *
 * Google refuses to sign anyone in inside an embedded window, so the page
 * cannot use its usual popup here. Instead this runs the "installed app" flow:
 * open the consent page in the person's own browser, listen on a loopback port
 * for the redirect that carries the authorization code, then exchange the code
 * for tokens. PKCE ties the code to this process so nothing else on the
 * machine can redeem it.
 *
 * The client comes from the JSON Google Cloud hands out for a "Desktop app"
 * OAuth client. That file is read from the app's data folder, never bundled —
 * see clientFile(). Google's own docs note the "secret" in a desktop client
 * is not confidential, which is why this flow leans on PKCE rather than on it.
 *
 * Tokens are kept in the same folder so the consent screen appears once, not
 * every hour: the refresh token renews the short-lived access token silently.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { app, shell } from "electron";

/** Google's endpoints; the client file carries the same, but these are fixed. */
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** How long to wait for the browser round trip before giving up. */
const TIMEOUT_MS = 5 * 60 * 1000;

/** Renew this many seconds before the access token actually expires. */
const EXPIRY_SLACK_S = 60;

const CLIENT_FILE = "google-client.json";
const TOKENS_FILE = "google-tokens.json";

/** Trailing base64 padding, which base64url drops. */
const BASE64_PADDING = /[=]+$/;

const DONE_PAGE =
  "<!doctype html><title>Signed in</title><body style='font-family:-apple-system,sans-serif;background:#000;color:#fff;display:grid;place-items:center;height:100vh;margin:0'><p>You can close this tab and return to the app.</p></body>";

const dataDir = () => app.getPath("userData");

const readdirSafe = (dir) => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

/**
 * Where the client JSON is expected.
 *
 * GOOGLE_DESKTOP_CLIENT_FILE overrides it; otherwise the app data folder. In
 * dev, a `client_secret_*.json` dropped in the repo root is picked up too, so
 * the download from Google Cloud works without a copy step.
 */
const clientFile = () => {
  const fromEnv = process.env.GOOGLE_DESKTOP_CLIENT_FILE?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const inData = path.join(dataDir(), CLIENT_FILE);
  if (existsSync(inData) || app.isPackaged) {
    return inData;
  }
  const root = path.resolve(app.getAppPath());
  const dropped = readdirSafe(root).find(
    (f) => f.startsWith("client_secret_") && f.endsWith(".json")
  );
  return dropped ? path.join(root, dropped) : inData;
};

const loadClient = () => {
  const file = clientFile();
  if (!existsSync(file)) {
    throw new Error(
      `Google sign-in is not set up on this computer. Put the OAuth "Desktop app" client JSON at ${file}.`
    );
  }
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  const client = parsed.installed ?? parsed.web ?? parsed;
  if (!(client.client_id && client.client_secret)) {
    throw new Error(`${file} is not a Google OAuth client file.`);
  }
  return { id: client.client_id, secret: client.client_secret };
};

const tokensFile = () => path.join(dataDir(), TOKENS_FILE);

const loadTokens = () => {
  try {
    return JSON.parse(readFileSync(tokensFile(), "utf8"));
  } catch {
    return null;
  }
};

const saveTokens = (tokens) => {
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(tokensFile(), JSON.stringify(tokens, null, 2), { mode: 0o600 });
};

const base64url = (buf) =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(BASE64_PADDING, "");

const scopesCover = (granted, wanted) => {
  const have = new Set((granted ?? "").split(" ").filter(Boolean));
  return wanted.split(" ").every((s) => have.has(s));
};

const postForm = async (url, form) => {
  const res = await fetch(url, {
    body: new URLSearchParams(form),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Google token endpoint answered ${res.status}: ${body.error_description ?? body.error ?? "unknown error"}`
    );
  }
  return body;
};

/**
 * One-shot loopback listener. Resolves to the redirect URI once bound, and to
 * the query string of the first request through `redirected`.
 *
 * @returns {Promise<{redirectUri: string, redirected: Promise<URLSearchParams>}>}
 */
const listenForRedirect = () =>
  new Promise((resolveListening, rejectListening) => {
    let resolveRedirect;
    let rejectRedirect;
    const redirected = new Promise((resolve, reject) => {
      resolveRedirect = resolve;
      rejectRedirect = reject;
    });

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(DONE_PAGE);
      clearTimeout(timer);
      server.close();
      resolveRedirect(url.searchParams);
    });
    const timer = setTimeout(() => {
      server.close();
      rejectRedirect(new Error("Google sign-in timed out. Try again."));
    }, TIMEOUT_MS);

    server.on("error", rejectListening);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolveListening({
        redirected,
        redirectUri: `http://127.0.0.1:${port}/oauth`,
      });
    });
  });

/**
 * Full consent round trip through the system browser. Returns Google's token
 * response, with the refresh token merged in from the previous one when
 * Google omits it (it only sends a refresh token on first consent).
 */
const consent = async (client, scope) => {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(16));

  const { redirectUri, redirected } = await listenForRedirect();

  const params = new URLSearchParams({
    access_type: "offline",
    client_id: client.id,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "consent",
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    state,
  });
  await shell.openExternal(`${AUTH_URL}?${params}`);

  const query = await redirected;
  if (query.get("state") !== state) {
    throw new Error("Google sign-in returned an unexpected state.");
  }
  const code = query.get("code");
  if (!code) {
    throw new Error(
      `Google did not grant access (${query.get("error") ?? "no code"}).`
    );
  }

  const tokens = await postForm(TOKEN_URL, {
    client_id: client.id,
    client_secret: client.secret,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  return {
    ...tokens,
    refresh_token: tokens.refresh_token ?? loadTokens()?.refresh_token,
  };
};

const refresh = async (client, refreshToken) => {
  const tokens = await postForm(TOKEN_URL, {
    client_id: client.id,
    client_secret: client.secret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return { ...tokens, refresh_token: refreshToken };
};

const persist = (tokens, scope) => {
  const expiresIn = Number(tokens.expires_in ?? 3600);
  saveTokens({
    access_token: tokens.access_token,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope ?? scope,
  });
  return { access_token: tokens.access_token, expires_in: expiresIn };
};

/**
 * An access token covering `scope`, from cache, refresh or a fresh consent —
 * whichever is the least the situation needs. Shape matches what Google
 * Identity Services hands the page, so the page treats both alike.
 *
 * @returns {Promise<{access_token: string, expires_in: number}>}
 */
export const requestGoogleToken = async (scope) => {
  const client = loadClient();
  const cached = loadTokens();
  const now = Math.floor(Date.now() / 1000);

  if (cached && scopesCover(cached.scope, scope)) {
    if (cached.expires_at - EXPIRY_SLACK_S > now) {
      return {
        access_token: cached.access_token,
        expires_in: cached.expires_at - now,
      };
    }
    if (cached.refresh_token) {
      try {
        return persist(await refresh(client, cached.refresh_token), scope);
      } catch (e) {
        console.warn(`[google] refresh failed, asking again: ${e.message}`);
      }
    }
  }

  return persist(await consent(client, scope), scope);
};

/** Forgets the stored tokens; the next request starts at the consent screen. */
export const forgetGoogleToken = () => {
  try {
    writeFileSync(tokensFile(), "{}");
  } catch {
    // Nothing stored, nothing to forget.
  }
};
