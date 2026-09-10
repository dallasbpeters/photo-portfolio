/**
 * The local vector bridge, as the browser sees it.
 *
 * The bridge (scripts/affinity-bridge.mjs) is a small HTTP server on this
 * machine that downloads an SVG and opens it in a desktop editor. Which editor
 * is the bridge's setting, not the browser's — which is why the name is asked
 * for rather than written down here. These are the calls the canvas makes. Change detection lives here, not on the
 * bridge: the bridge is stateless on purpose, and it is the browser that knows
 * which sha256 it opened with, so it can tell when the file has moved.
 *
 * The bridge is a dev tool, so none of this does anything clever when it is
 * missing — every call fails and the error says how to start it.
 */

const BRIDGE_ORIGIN =
  import.meta.env.VITE_AFFINITY_BRIDGE_ORIGIN ?? "http://localhost:4123";

/** An address whose path ends in .svg. The blob store names files honestly. */
const SVG_URL = /\.svg(?:\?|#|$)/i;

export const isSvgUrl = (url: string | null | undefined): boolean =>
  Boolean(url && SVG_URL.test(url));

const bridgeUrl = (path: string): string => `${BRIDGE_ORIGIN}${path}`;

const BRIDGE_HINT =
  "Is the vector bridge running? Start it with `node scripts/affinity-bridge.mjs`.";

/**
 * What the bridge is pointed at, for the labels that name it.
 *
 * Asked once and remembered, including the failure: a bridge that is not
 * running is not going to start answering because a menu opened, and one
 * request per render of every context menu is a lot of nothing.
 *
 * Null when it cannot be reached, which is the ordinary case — the bridge is a
 * dev tool. Callers fall back to naming no app at all rather than guessing,
 * because guessing "Affinity" is exactly the wrong answer for somebody who has
 * pointed it at something else.
 */
let appNamePromise: Promise<string | null> | null = null;

export const bridgeAppName = (): Promise<string | null> => {
  appNamePromise ??= (async () => {
    try {
      const res = await fetch(bridgeUrl("/"));
      if (!res.ok) {
        return null;
      }
      const body = (await res.json()) as { app?: unknown };
      return typeof body.app === "string" && body.app.trim()
        ? body.app.trim()
        : null;
    } catch {
      return null;
    }
  })();
  return appNamePromise;
};

const bridgeFetch = async (path: string, init?: RequestInit) => {
  try {
    return await fetch(bridgeUrl(path), init);
  } catch (cause) {
    throw new Error(
      `Could not reach the vector bridge on ${BRIDGE_ORIGIN}. ${BRIDGE_HINT}`,
      { cause }
    );
  }
};

export interface AffinityStatus {
  file: boolean;
  hash: string | null;
}

/**
 * What a successful write-back changed on the item.
 *
 * Exactly one field is set: an op node's edit lands as a new result (the edited
 * version is its last history entry), while a reference whose source is the SVG
 * has the source replaced outright — there is no history for a single picture.
 */
export interface AffinityWriteback {
  imageUrl?: string;
  result?: unknown;
}

/** Downloads the SVG and asks the editor to open it; returns the baseline hash. */
export const affinityOpen = async (
  itemId: string,
  url: string
): Promise<string | null> => {
  const res = await bridgeFetch(`/open?item=${encodeURIComponent(itemId)}`, {
    body: JSON.stringify({ url }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(await affinityError(res));
  }
  return ((await res.json()) as { hash: string | null }).hash ?? null;
};

/** Whether the working copy has changed since the browser last read it. */
export const affinityStatus = async (
  itemId: string
): Promise<AffinityStatus> => {
  const res = await bridgeFetch(`/status?item=${encodeURIComponent(itemId)}`);
  if (!res.ok) {
    throw new Error(await affinityError(res));
  }
  return (await res.json()) as AffinityStatus;
};

/** The current working copy, as SVG source. */
export const affinityReadSvg = async (itemId: string): Promise<string> => {
  const res = await bridgeFetch(`/file?item=${encodeURIComponent(itemId)}`);
  if (!res.ok) {
    throw new Error(await affinityError(res));
  }
  return res.text();
};

const affinityError = async (res: Response): Promise<string> => {
  let message = "";
  try {
    message = ((await res.json()) as { error?: string }).error ?? "";
  } catch {
    message = "";
  }
  return message || `The vector bridge answered ${res.status}. ${BRIDGE_HINT}`;
};
