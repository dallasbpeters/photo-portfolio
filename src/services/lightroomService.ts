import { apiBase, jsonHeaders, readPageError } from "./portfolioService";

/**
 * The Lightroom client, in its own module.
 *
 * Not in portfolioService.ts because that file is 2,000 lines and under a
 * shrink-only rule in scripts/check-file-size.ts — a new integration is exactly
 * the kind of thing that should stop being added to it. The shared request
 * helpers are imported rather than copied.
 */

/** A Lightroom album as the picker lists it. */
export interface LightroomAlbum {
  id: string;
  isSet: boolean;
  name: string;
  parentId: string | null;
  updatedAt: string | null;
}

/** One asset in an album, with whether it is already in the library. */
export interface LightroomAsset {
  camera: string | null;
  captureDate: string | null;
  fileName: string | null;
  height: number | null;
  id: string;
  imported: boolean;
  photoId: string | null;
  width: number | null;
}

/**
 * Whether Lightroom can be used, and what is in the way if not.
 *
 * Three states rather than one, because the fixes differ: `configured` is an
 * env var on the deployment, `connected` is an OAuth handshake, and `entitled`
 * is whether the connected Adobe account has a Lightroom subscription at all.
 */
/** Where each half of the credentials came from. */
export interface LightroomCredentialSource {
  clientId: "database" | "environment" | "none";
  clientSecret: "database" | "environment" | "none";
}

/**
 * The credentials as the panel may know them.
 *
 * No secret, ever — the API reports whether one is stored, never its value.
 * The client id is not a secret: it travels in the authorize URL in plain sight.
 */
export interface LightroomCredentials {
  clientId: string;
  hasSecret: boolean;
  /** Shown so it can be pasted into Adobe's console, where it must match. */
  redirectUri: string;
  /** "default" means nobody has chosen one, so the panel offers this origin. */
  redirectUriSource: "database" | "default" | "environment";
  source: LightroomCredentialSource;
}

export interface LightroomStatus extends LightroomCredentials {
  accountEmail?: string | null;
  catalogId?: string | null;
  configured: boolean;
  connected: boolean;
  entitled?: boolean;
  /** A connection that exists but cannot be used, with the reason. */
  error?: string;
  /** Which half is missing, when `configured` is false. */
  missing?: string | null;
}

export interface LightroomImportResult {
  failed: { assetId: string; error?: string }[];
  imported: number;
  skipped: number;
}

/**
 * Adobe Lightroom: browse the connected catalogue and copy assets in.
 *
 * Every call goes through our own API so an Adobe token never reaches the
 * browser — the same arrangement as Canva. See config/lightroom.ts on why this
 * may answer "not configured" for a long time: the Lightroom APIs are gated to
 * partner applications Adobe has entitled.
 */
export const lightroomApi = {
  albums: async (): Promise<{
    albums: LightroomAlbum[];
    catalogId: string;
  }> => {
    const res = await fetch(`${apiBase()}/api/lightroom/albums`, {
      headers: jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not list the albums"));
    }
    return (await res.json()) as {
      albums: LightroomAlbum[];
      catalogId: string;
    };
  },

  assets: async (
    albumId: string,
    cursor?: string | null
  ): Promise<{ assets: LightroomAsset[]; next: string | null }> => {
    const params = new URLSearchParams({ albumId });
    if (cursor) {
      params.set("cursor", cursor);
    }
    const res = await fetch(
      `${apiBase()}/api/lightroom/assets?${params.toString()}`,
      { headers: jsonHeaders() }
    );
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not read the album"));
    }
    return (await res.json()) as {
      assets: LightroomAsset[];
      next: string | null;
    };
  },

  /** Forgets the stored credentials, falling back to the environment. */
  clearCredentials: async (): Promise<void> => {
    const res = await fetch(`${apiBase()}/api/lightroom/credentials`, {
      headers: jsonHeaders(),
      method: "DELETE",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not clear them"));
    }
  },

  /** The consent URL to send the browser to. */
  connect: async (returnTo: string): Promise<{ url: string }> => {
    const res = await fetch(
      `${apiBase()}/api/lightroom/connect?returnTo=${encodeURIComponent(returnTo)}`,
      { headers: jsonHeaders() }
    );
    if (!res.ok) {
      throw new Error(
        await readPageError(res, "Could not start the handshake")
      );
    }
    return (await res.json()) as { url: string };
  },

  credentials: async (): Promise<LightroomCredentials> => {
    const res = await fetch(`${apiBase()}/api/lightroom/credentials`, {
      headers: jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not read them"));
    }
    return (await res.json()) as LightroomCredentials;
  },

  disconnect: async (): Promise<void> => {
    const res = await fetch(`${apiBase()}/api/lightroom/disconnect`, {
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not disconnect"));
    }
  },

  /**
   * Copies the chosen assets in.
   *
   * The metadata travels with each asset rather than being re-fetched per
   * picture on the server — the panel has just read it from the listing.
   */
  importAssets: async (
    assets: LightroomAsset[],
    categoryId: string
  ): Promise<LightroomImportResult> => {
    const res = await fetch(`${apiBase()}/api/lightroom/import`, {
      body: JSON.stringify({
        assets: assets.map((asset) => ({
          camera: asset.camera,
          captureDate: asset.captureDate,
          fileName: asset.fileName,
          height: asset.height,
          id: asset.id,
          width: asset.width,
        })),
        categoryId,
      }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "The import failed"));
    }
    return (await res.json()) as LightroomImportResult;
  },

  /**
   * Saves what was filled in.
   *
   * An omitted or blank secret keeps the stored one, because the panel is never
   * given it and so cannot send it back — correcting a typo in the client id
   * must not wipe the secret.
   */
  saveCredentials: async (next: {
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
  }): Promise<LightroomCredentials> => {
    const res = await fetch(`${apiBase()}/api/lightroom/credentials`, {
      body: JSON.stringify(next),
      headers: jsonHeaders(),
      method: "PUT",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not save them"));
    }
    return (await res.json()) as LightroomCredentials;
  },

  status: async (): Promise<LightroomStatus> => {
    const res = await fetch(`${apiBase()}/api/lightroom/status`, {
      headers: jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not read the status"));
    }
    return (await res.json()) as LightroomStatus;
  },
};
