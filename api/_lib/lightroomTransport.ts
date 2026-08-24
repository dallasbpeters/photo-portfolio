import { LIGHTROOM_API } from "../../config/lightroom.js";

/**
 * Talking to lr.adobe.io: the connection, the guard, and one request.
 *
 * Split from lightroom.ts, which owns OAuth and the token store, and the seam is
 * what each half *needs*. This half needs nothing but a URL and a token that has
 * already been obtained. The other half reads `process.env` and hashes with
 * `node:crypto`, and importing it dragged `node:fs` in behind — which the browser
 * the tests run in cannot have, so the parsing this integration most needs
 * covered was the one part that could not be tested. That was a warning on one
 * machine and a failed CI run on another, which is the worst kind of difference.
 *
 * Two things about this API are unusual enough to be worth knowing. Its JSON
 * responses are prefixed with `while (1) {}`, and every request needs the client
 * id as an `X-API-Key` header *in addition to* the bearer token. Both are handled
 * here, once.
 */

/**
 * A live connection: the token, and the key that must accompany it.
 *
 * `clientId` rides along because lr.adobe.io requires it as `X-API-Key` on every
 * request — the token says who the customer is, the key says which entitled
 * application is asking. It used to be read from the environment at call time;
 * now that the credentials can come from the database it has to be carried, and
 * the connection is already threaded everywhere the key is needed.
 */
export interface LightroomConnection {
  accessToken: string;
  accountEmail: string | null;
  catalogId: string | null;
  clientId: string;
}

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
      "X-API-Key": connection.clientId,
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
