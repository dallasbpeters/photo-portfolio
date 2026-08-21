/*
 * The key type is taken from `createPublicKey`'s own input rather than named
 * directly.
 *
 * `node:crypto` used to export `JsonWebKey` at the top level and @types/node 26
 * moved it inside a namespace, so importing it by name stopped compiling. Naming
 * it through `JsonWebKeyInput["key"]` — which is still exported, and is by
 * definition the type this call wants — cannot drift from the function it is
 * being passed to. It also keeps the original reason for not using the global:
 * the DOM lib declares a same-named, incompatible `JsonWebKey`, and tsconfig
 * includes both libs.
 */
import { createPublicKey, type JsonWebKeyInput } from "node:crypto";
import jwt, { type JwtHeader } from "jsonwebtoken";

/** Google's published signing keys. */
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

const GOOGLE_ISSUERS: [string, ...string[]] = [
  "https://accounts.google.com",
  "accounts.google.com",
];

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

interface GoogleJwk {
  alg?: string;
  e: string;
  kid: string;
  kty: string;
  n: string;
  use?: string;
}

/**
 * Cached JWKS. Google rotates these keys, so the cache is short and a cache miss
 * on an unknown `kid` forces a refetch rather than failing the sign-in.
 */
let jwksCache: { keys: GoogleJwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

const fetchJwks = async (force = false): Promise<GoogleJwk[]> => {
  // Narrowed on the cache itself rather than a separate boolean, so the
  // compiler can see that `keys` is present without a non-null assertion.
  if (jwksCache && !force && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }

  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) {
    throw new Error(`Could not fetch Google signing keys (${res.status})`);
  }

  const body = (await res.json()) as { keys?: GoogleJwk[] };
  const keys = body.keys ?? [];
  jwksCache = { fetchedAt: Date.now(), keys };
  return keys;
};

const findKey = async (kid: string): Promise<GoogleJwk | undefined> => {
  const keys = await fetchJwks();
  const hit = keys.find((k) => k.kid === kid);
  if (hit) {
    return hit;
  }
  // Unknown kid usually means Google rotated keys since the last fetch.
  return (await fetchJwks(true)).find((k) => k.kid === kid);
};

/** Thrown when GOOGLE_CLIENT_ID is absent, so handlers can answer 503. */
export class GoogleNotConfiguredError extends Error {
  constructor() {
    super("Google sign-in is not configured");
    this.name = "GoogleNotConfiguredError";
  }
}

/**
 * Verifies a Google Identity Services ID token and returns the identity it
 * asserts.
 *
 * The signature, issuer, expiry and audience are all checked — `aud` in
 * particular, so a token minted for some other Google app cannot be replayed
 * here. Returns null for any token that fails verification.
 */
export const verifyGoogleIdToken = async (
  idToken: string
): Promise<GoogleIdentity | null> => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new GoogleNotConfiguredError();
  }

  const decoded = jwt.decode(idToken, { complete: true });
  const header = decoded?.header as JwtHeader | undefined;
  if (!header?.kid || header.alg !== "RS256") {
    return null;
  }

  const jwk = await findKey(header.kid);
  if (!jwk) {
    return null;
  }

  let payload: jwt.JwtPayload;
  try {
    const publicKey = createPublicKey({
      format: "jwk",
      key: jwk as unknown as JsonWebKeyInput["key"],
    });
    payload = jwt.verify(idToken, publicKey, {
      algorithms: ["RS256"],
      audience: clientId,
      issuer: GOOGLE_ISSUERS,
    }) as jwt.JwtPayload;
  } catch {
    return null;
  }

  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email) {
    return null;
  }

  return {
    email,
    // Google sends this as a boolean or the string "true" depending on flow.
    emailVerified:
      payload.email_verified === true || payload.email_verified === "true",
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
};
