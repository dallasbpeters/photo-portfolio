import type { BrandKitDoc } from "../../config/brandKit.js";
import { apiBase, jsonHeaders, readPageError } from "./portfolioService";

/**
 * The brand kits, in their own module.
 *
 * Moved out of portfolioService.ts, which is nearly two thousand lines and under
 * a shrink-only rule in scripts/check-file-size.ts — CI was failing on it. A
 * whole feature's client is exactly the kind of thing that should stop living
 * there, and lightroomService.ts had already set the precedent. The shared
 * request helpers are imported rather than copied.
 */

/** What the brand-kit endpoints hand back. See api/_lib/brandKitStore.ts. */
export interface BrandKit {
  createdAt: string;
  /** What this kit itself states. */
  doc: BrandKitDoc;
  id: string;
  /** Parts of `resolvedDoc` that came from the parent, named. */
  inherited: string[];
  name: string;
  parentId: string | null;
  parentName: string | null;
  /** What the kit means with its parent folded in. */
  resolvedDoc: BrandKitDoc;
  updatedAt: string;
  version: number | null;
  versionCount: number;
  versionId: string | null;
}

export interface BrandKitVersion {
  createdAt: string;
  doc: BrandKitDoc;
  id: string;
  version: number;
}

/**
 * The brand kits.
 *
 * `save` sends the whole document rather than a patch of it, because a version
 * is the whole document — there is nothing meaningful to send half of. The
 * server writes a new version for every call that carries one, which is why the
 * panel debounces nothing and saves on a press.
 */
export const brandKitsApi = {
  /** `parentId` makes it a sub-brand. One level only — see patch 032. */
  create: async (
    name: string,
    doc?: BrandKitDoc,
    parentId?: string | null
  ): Promise<BrandKit> => {
    const res = await fetch(`${apiBase()}/api/brand-kits`, {
      body: JSON.stringify({ doc, name, parentId }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not create the kit"));
    }
    return (await res.json()) as BrandKit;
  },

  get: async (id: string): Promise<BrandKit> => {
    const res = await fetch(`${apiBase()}/api/brand-kits/${id}`, {
      headers: jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not load the kit"));
    }
    return (await res.json()) as BrandKit;
  },

  /** The kit with its history — asked for only when a kit is open. */
  history: async (
    id: string
  ): Promise<BrandKit & { versions: BrandKitVersion[] }> => {
    const res = await fetch(`${apiBase()}/api/brand-kits/${id}?versions=1`, {
      headers: jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not load the history"));
    }
    return (await res.json()) as BrandKit & { versions: BrandKitVersion[] };
  },

  list: async (): Promise<BrandKit[]> => {
    const res = await fetch(`${apiBase()}/api/brand-kits`, {
      headers: jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not load brand kits"));
    }
    return (await res.json()) as BrandKit[];
  },

  remove: async (id: string): Promise<void> => {
    const res = await fetch(`${apiBase()}/api/brand-kits/${id}`, {
      headers: jsonHeaders(),
      method: "DELETE",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not delete the kit"));
    }
  },

  rename: async (id: string, name: string): Promise<BrandKit> => {
    const res = await fetch(`${apiBase()}/api/brand-kits/${id}`, {
      body: JSON.stringify({ name }),
      headers: jsonHeaders(),
      method: "PATCH",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not rename the kit"));
    }
    return (await res.json()) as BrandKit;
  },

  /** A new version. Renaming is separate, and deliberately not one. */
  save: async (id: string, doc: BrandKitDoc): Promise<BrandKit> => {
    const res = await fetch(`${apiBase()}/api/brand-kits/${id}`, {
      body: JSON.stringify({ doc }),
      headers: jsonHeaders(),
      method: "PATCH",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not save the kit"));
    }
    return (await res.json()) as BrandKit;
  },
};
