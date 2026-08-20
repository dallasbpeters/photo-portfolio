/**
 * The local Affinity bridge, as the browser sees it.
 *
 * The bridge (scripts/affinity-bridge.mjs) is a small HTTP server on this
 * machine that downloads an SVG and opens it in Affinity Designer. These are
 * the calls the canvas makes to it. Change detection lives here, not on the
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
  "Is the Affinity bridge running? Start it with `node scripts/affinity-bridge.mjs`.";

const bridgeFetch = async (path: string, init?: RequestInit) => {
  try {
    return await fetch(bridgeUrl(path), init);
  } catch (cause) {
    throw new Error(
      `Could not reach the Affinity bridge on ${BRIDGE_ORIGIN}. ${BRIDGE_HINT}`,
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

/** Downloads the SVG and asks Affinity to open it; returns the baseline hash. */
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
  return (
    message || `The Affinity bridge answered ${res.status}. ${BRIDGE_HINT}`
  );
};
