import {
  LIGHTROOM_PAGE_SIZE,
  type LightroomRendition,
} from "../../config/lightroom.js";
import {
  type LightroomConnection,
  lrFetch,
  lrJson,
} from "./lightroomTransport.js";

/**
 * Reading a Lightroom catalogue: the account, its albums, and what is in them.
 *
 * Split from lightroom.ts, which owns tokens and transport. This module owns
 * the *shape* of Adobe's answers, and that shape is the interesting part: every
 * response is `{ base, resources, links }` where `base` is a URL prefix the
 * resources' own hrefs are relative to, and each resource carries a `payload`
 * that is closer to a document than to a row.
 *
 * Everything here reads that payload defensively. It is user-authored data that
 * has travelled through several versions of Lightroom on several devices, and a
 * missing capture date or a camera that reports its model in an unexpected place
 * must cost one absent field rather than a failed import — the same reasoning
 * `imageUrlsOf` applies to our own JSONB columns.
 */

/** The envelope every list endpoint answers with. */
interface LrList<T> {
  base?: string;
  links?: { next?: { href?: string } };
  resources?: T[];
}

interface LrAlbumResource {
  created?: string;
  id?: string;
  payload?: {
    name?: string;
    parent?: { id?: string };
  };
  subtype?: string;
  updated?: string;
}

interface LrAssetResource {
  /** On an album listing the asset is nested; on a catalogue listing it is not. */
  asset?: LrAssetResource;
  id?: string;
  payload?: {
    captureDate?: string;
    develop?: unknown;
    importSource?: {
      fileName?: string;
      originalHeight?: number;
      originalWidth?: number;
      sha256?: string;
    };
    xmp?: {
      exif?: Record<string, unknown>;
      tiff?: { Make?: string; Model?: string };
    };
  };
  subtype?: string;
}

/** An album as the picker shows it. */
export interface LightroomAlbum {
  id: string;
  /** "collection" holds pictures; "collection_set" only holds other albums. */
  isSet: boolean;
  name: string;
  /** Null at the top level. Lets the panel draw the tree Lightroom shows. */
  parentId: string | null;
  updatedAt: string | null;
}

/** An asset as the picker shows it, and as an import reads it. */
export interface LightroomAsset {
  camera: string | null;
  /** ISO 8601, straight from Lightroom. Becomes the photograph's date. */
  captureDate: string | null;
  fileName: string | null;
  height: number | null;
  id: string;
  width: number | null;
}

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;

/**
 * The account's single catalogue id.
 *
 * Single, deliberately — Lightroom's cloud model gives an account exactly one
 * catalogue, which is why the endpoint is `/v2/catalog` and not a list. Cached
 * on the token row at connect time; this is what fills it.
 */
export const fetchCatalogId = async (
  connection: LightroomConnection
): Promise<string> => {
  const body = await lrJson<{ id?: string }>(connection, "/v2/catalog");
  const id = asString(body.id);
  if (!id) {
    throw new Error("Lightroom returned an account with no catalogue");
  }
  return id;
};

/**
 * Who is connected, and whether they can actually use this.
 *
 * Adobe requires the caller to check entitlement rather than assuming it: an
 * account with a lapsed subscription authorises perfectly well and then answers
 * 403 on every asset. Asking here means the panel can say "this Adobe account
 * has no Lightroom subscription" instead of showing an empty album list.
 */
export const fetchAccount = async (
  connection: LightroomConnection
): Promise<{ email: string | null; entitled: boolean }> => {
  const body = await lrJson<{
    email?: string;
    entitlement?: { status?: string };
    full_name?: string;
  }>(connection, "/v2/account");
  const status = asString(body.entitlement?.status);
  return {
    email: asString(body.email) ?? asString(body.full_name),
    // Adobe reports a handful of words here; a subscriber and a trialist can
    // both use the API, and anything else cannot. Treated as entitled when the
    // field is absent, because a missing field is not evidence of absence and
    // refusing on it would break the integration on a shape change.
    entitled: status === null || status === "subscriber" || status === "trial",
  };
};

export const listAlbums = async (
  connection: LightroomConnection,
  catalogId: string
): Promise<LightroomAlbum[]> => {
  const body = await lrJson<LrList<LrAlbumResource>>(
    connection,
    `/v2/catalogs/${catalogId}/albums?limit=${LIGHTROOM_PAGE_SIZE}`
  );
  return (body.resources ?? [])
    .map((resource) => {
      const id = asString(resource.id);
      if (!id) {
        return null;
      }
      return {
        id,
        isSet: resource.subtype === "collection_set",
        // An album with no name is possible and reads as a blank row, which is
        // worse than saying what it is.
        name: asString(resource.payload?.name) ?? "Untitled album",
        parentId: asString(resource.payload?.parent?.id),
        updatedAt: asString(resource.updated),
      };
    })
    .filter((album): album is LightroomAlbum => album !== null);
};

/** One asset resource flattened, from either listing shape. */
const readAsset = (resource: LrAssetResource): LightroomAsset | null => {
  // An album listing wraps the asset in an `asset_album` resource whose own id
  // is the *membership*, not the picture. Reading that id would produce an
  // import that 404s on every rendition.
  const asset = resource.asset ?? resource;
  const id = asString(asset.id);
  if (!id) {
    return null;
  }
  const payload = asset.payload ?? {};
  const tiff = payload.xmp?.tiff;
  const make = asString(tiff?.Make);
  const model = asString(tiff?.Model);
  return {
    camera:
      // Canon reports "Canon" and "Canon EOS R5"; joining blindly gives "Canon
      // Canon EOS R5", which is how camera names end up doubled everywhere.
      model && make && !model.startsWith(make)
        ? `${make} ${model}`
        : (model ?? make),
    captureDate: asString(payload.captureDate),
    fileName: asString(payload.importSource?.fileName),
    height: asNumber(payload.importSource?.originalHeight),
    id,
    width: asNumber(payload.importSource?.originalWidth),
  };
};

/**
 * What is in an album, one page at a time.
 *
 * The cursor is Adobe's own `links.next.href` rather than an offset we compute:
 * their paging is keyset, and an offset recomputed on our side drifts as the
 * album is edited during the walk. Returned verbatim for the caller to hand
 * back, which is why it is a string and not parsed.
 */
export const listAlbumAssets = async (
  connection: LightroomConnection,
  catalogId: string,
  albumId: string,
  cursor?: string | null
): Promise<{ assets: LightroomAsset[]; next: string | null }> => {
  const path =
    cursor ??
    `/v2/catalogs/${catalogId}/albums/${albumId}/assets?limit=${LIGHTROOM_PAGE_SIZE}&subtype=image`;
  const body = await lrJson<LrList<LrAssetResource>>(connection, path);
  const assets = (body.resources ?? [])
    .map(readAsset)
    .filter((asset): asset is LightroomAsset => asset !== null);
  return { assets, next: nextPath(body) };
};

/**
 * The next page's path, made relative.
 *
 * Adobe answers with an href relative to the response's own `base`, which is an
 * absolute URL. `lrFetch` prepends the API host, so an absolute href handed
 * straight back produces a doubled URL. Reduced to a path here so the caller
 * can stay ignorant of it.
 */
const nextPath = (body: LrList<unknown>): string | null => {
  const href = body.links?.next?.href;
  if (typeof href !== "string" || !href) {
    return null;
  }
  const path = href.startsWith("/") ? href : resolved(href, body.base);
  /*
   * Only a versioned API path is followed.
   *
   * `new URL` is lenient — it resolves nonsense like "::::" to "/::::" rather
   * than throwing — so "did it parse" is not the question worth asking. "Is
   * this a path on the API we are already talking to" is, and it means a
   * malformed or unexpected href ends the walk instead of sending an
   * authenticated request somewhere arbitrary.
   */
  return path?.startsWith("/v2/") ? path : null;
};

/** An absolute href reduced to a path, or null if it will not parse at all. */
const resolved = (href: string, base: string | undefined): string | null => {
  try {
    const url = new URL(href, base ?? "https://lr.adobe.io");
    return `${url.pathname}${url.search}`;
  } catch {
    // A truncated album is a smaller import; an exception is no import at all.
    return null;
  }
};

/** Where a rendition of an asset lives. */
export const renditionPath = (
  catalogId: string,
  assetId: string,
  rendition: LightroomRendition
): string =>
  `/v2/catalogs/${catalogId}/assets/${assetId}/renditions/${rendition}`;

/**
 * A rendition's bytes.
 *
 * Generated on demand by Adobe: a rendition that has never been asked for
 * answers 404 with a body saying so, and the fix is a POST to the renditions
 * endpoint to ask for it, then asking again. Handled by the caller, because
 * "wait and retry" is a decision about a whole import rather than one picture.
 */
export const fetchRendition = async (
  connection: LightroomConnection,
  catalogId: string,
  assetId: string,
  rendition: LightroomRendition
): Promise<{ bytes: ArrayBuffer; contentType: string | null } | "absent"> => {
  const res = await lrFetch(
    connection,
    renditionPath(catalogId, assetId, rendition)
  );
  if (res.status === 404) {
    return "absent";
  }
  if (!res.ok) {
    throw new Error(
      `Could not fetch the ${rendition} rendition of ${assetId} (${res.status})`
    );
  }
  return {
    bytes: await res.arrayBuffer(),
    contentType: res.headers.get("content-type"),
  };
};

/**
 * Asks Adobe to generate a rendition that does not exist yet.
 *
 * A 202 means "started, come back"; the caller polls the GET. Fire-and-forget
 * from our side — there is nothing useful in the body.
 */
export const requestRendition = async (
  connection: LightroomConnection,
  catalogId: string,
  assetId: string,
  rendition: LightroomRendition
): Promise<void> => {
  await lrFetch(
    connection,
    `/v2/catalogs/${catalogId}/assets/${assetId}/renditions`,
    {
      headers: { "X-Generate-Renditions": rendition },
      method: "POST",
    }
  );
};
