import { AsyncLocalStorage } from "node:async_hooks";
import { tokenFromHeaders } from "./claudeTokenState.js";

/**
 * The identity token for the request being served, without threading it.
 *
 * Vercel signs an OIDC token per request and delivers it as a header, so
 * anything that wants to authenticate to Claude needs the request. The obvious
 * way to get it there is to pass it down, and the path is long: a run handler,
 * the element loader, the brief cache, the vision call. Four signatures grow a
 * parameter three of them do not use, and every future caller has to be given
 * one too.
 *
 * A module-level variable would be shorter and wrong. A warm function instance
 * serves overlapping requests, so "the current headers" in a plain binding is
 * whichever request wrote last — which fails rarely, under load, and looks like
 * an authentication bug rather than a shared-state one.
 *
 * AsyncLocalStorage is the primitive for exactly this: a value scoped to one
 * asynchronous call tree, invisible to every other. The handler opens the
 * scope once; everything beneath it reads without knowing it is there.
 */

const store = new AsyncLocalStorage<string>();

/**
 * Runs `work` with this request's identity token in scope.
 *
 * Wrapping a handler that never reaches Claude costs nothing, so the rule is
 * simple: wrap at the door rather than deciding per route which routes might
 * one day need it.
 */
export const withRequestIdentity = <T>(
  headers: Record<string, string | string[] | undefined>,
  work: () => Promise<T>
): Promise<T> => {
  const assertion = tokenFromHeaders(
    headers,
    process.env.VERCEL_OIDC_TOKEN ?? ""
  );
  return assertion ? store.run(assertion, work) : work();
};

/**
 * This request's identity token, or null outside a wrapped handler.
 *
 * The environment is the fallback rather than the primary: `vercel dev` sets
 * VERCEL_OIDC_TOKEN, so local work has an identity without every script
 * learning to open a scope. In production the header wins, because it belongs
 * to the request rather than to the deployment.
 */
export const currentIdentityToken = (): string | null =>
  store.getStore() ?? ((process.env.VERCEL_OIDC_TOKEN ?? "").trim() || null);
