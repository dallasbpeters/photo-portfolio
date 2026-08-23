import { describe, expect, it } from "vitest";
import { listAlbumAssets, listAlbums } from "./lightroomCatalog.js";

/**
 * Adobe's response shape, pinned.
 *
 * Everything here is a decision that is invisible until it is wrong on real
 * data: which id an album listing actually carries, whether a camera name ends
 * up doubled, and whether the paging cursor is usable. None of it needs
 * credentials to test — it needs a stub answering the shape the API answers
 * with, which is exactly what the fixtures below are.
 */

const connection = {
  accessToken: "t",
  accountEmail: null,
  catalogId: "cat",
  // Required now that credentials can come from the database: every request
  // carries it as X-API-Key rather than reading the environment.
  clientId: "test-client-id",
};

/** A stub that answers every request with one body, guard prefix and all. */
const stub = (body: unknown) => {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string) => {
    calls.push(String(url));
    return Promise.resolve(
      // The guard is included so these tests exercise the real parse path.
      new Response(`while (1) {}\n${JSON.stringify(body)}`, { status: 200 })
    );
  }) as typeof globalThis.fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
};

describe("listAlbums", () => {
  it("reads names and marks collection sets", async () => {
    const s = stub({
      resources: [
        {
          id: "a1",
          payload: { name: "Cruise 2026" },
          subtype: "collection",
        },
        {
          id: "s1",
          payload: { name: "Client work" },
          subtype: "collection_set",
        },
      ],
    });
    try {
      const albums = await listAlbums(connection, "cat");
      expect(albums).toEqual([
        {
          id: "a1",
          isSet: false,
          name: "Cruise 2026",
          parentId: null,
          updatedAt: null,
        },
        {
          id: "s1",
          isSet: true,
          name: "Client work",
          parentId: null,
          updatedAt: null,
        },
      ]);
    } finally {
      s.restore();
    }
  });

  it("names an album that has none, rather than showing a blank row", async () => {
    const s = stub({ resources: [{ id: "a1", subtype: "collection" }] });
    try {
      expect((await listAlbums(connection, "cat"))[0].name).toBe(
        "Untitled album"
      );
    } finally {
      s.restore();
    }
  });

  it("drops a resource with no id instead of failing the listing", async () => {
    const s = stub({
      resources: [{ payload: { name: "no id" } }, { id: "ok" }],
    });
    try {
      const albums = await listAlbums(connection, "cat");
      expect(albums.map((a) => a.id)).toEqual(["ok"]);
    } finally {
      s.restore();
    }
  });
});

describe("listAlbumAssets", () => {
  it("reads the asset's id, not the membership's", async () => {
    /*
     * The bug this exists to prevent. An album listing wraps each picture in an
     * `asset_album` resource whose own id identifies the *membership*; using it
     * produces an import where every rendition 404s, and the cause is invisible
     * because the ids look equally plausible.
     */
    const s = stub({
      resources: [
        {
          asset: {
            id: "real-asset-id",
            payload: {
              captureDate: "2026-03-01T10:00:00Z",
              importSource: {
                fileName: "IMG_0421.dng",
                originalHeight: 4000,
                originalWidth: 6000,
              },
            },
          },
          id: "membership-id",
          type: "asset_album",
        },
      ],
    });
    try {
      const page = await listAlbumAssets(connection, "cat", "alb");
      expect(page.assets[0]).toEqual({
        camera: null,
        captureDate: "2026-03-01T10:00:00Z",
        fileName: "IMG_0421.dng",
        height: 4000,
        id: "real-asset-id",
        width: 6000,
      });
    } finally {
      s.restore();
    }
  });

  it("does not double a camera name that repeats its maker", async () => {
    // Canon reports Make "Canon" and Model "Canon EOS R5". Joining blindly is
    // how "Canon Canon EOS R5" ends up under every photograph.
    const cases: [string | undefined, string | undefined, string | null][] = [
      ["Canon", "Canon EOS R5", "Canon EOS R5"],
      ["NIKON CORPORATION", "NIKON Z 8", "NIKON CORPORATION NIKON Z 8"],
      ["FUJIFILM", "X-T5", "FUJIFILM X-T5"],
      [undefined, "X-T5", "X-T5"],
      ["FUJIFILM", undefined, "FUJIFILM"],
      [undefined, undefined, null],
    ];
    for (const [Make, Model, expected] of cases) {
      const s = stub({
        resources: [{ id: "a", payload: { xmp: { tiff: { Make, Model } } } }],
      });
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one stubbed call per case
        const page = await listAlbumAssets(connection, "cat", "alb");
        expect(page.assets[0].camera, `${Make} / ${Model}`).toBe(expected);
      } finally {
        s.restore();
      }
    }
  });

  it("reduces an absolute next href to a path", async () => {
    // lrFetch prepends the API host, so handing back an absolute href would
    // produce https://lr.adobe.io/https://lr.adobe.io/v2/... and a 404.
    const s = stub({
      base: "https://lr.adobe.io/",
      links: {
        next: {
          href: "https://lr.adobe.io/v2/catalogs/c/albums/a/assets?name_after=x",
        },
      },
      resources: [],
    });
    try {
      const page = await listAlbumAssets(connection, "cat", "alb");
      expect(page.next).toBe("/v2/catalogs/c/albums/a/assets?name_after=x");
    } finally {
      s.restore();
    }
  });

  it("refuses an href pointing off the API", async () => {
    const s = stub({
      links: { next: { href: "https://example.com/v2/catalogs/c/assets" } },
      resources: [],
    });
    try {
      // The path survives resolution, but only /v2/ paths on lr.adobe.io are
      // followed — lrFetch prepends the host, so an off-host href would have
      // become a request to lr.adobe.io with someone else's path.
      expect((await listAlbumAssets(connection, "cat", "alb")).next).toBe(
        "/v2/catalogs/c/assets"
      );
    } finally {
      s.restore();
    }
  });

  it("keeps a relative next href as given", async () => {
    const s = stub({
      links: { next: { href: "/v2/catalogs/c/albums/a/assets?name_after=y" } },
      resources: [],
    });
    try {
      expect((await listAlbumAssets(connection, "cat", "alb")).next).toBe(
        "/v2/catalogs/c/albums/a/assets?name_after=y"
      );
    } finally {
      s.restore();
    }
  });

  it("ends the walk on a next href it cannot read", async () => {
    /*
     * `new URL` is lenient enough to resolve "::::" to "/::::", so parsing is
     * not the test — refusing to send an authenticated request somewhere that
     * is not the API is. A truncated album is a smaller import; following a
     * stray href is a request nobody meant to make.
     */
    const s = stub({ links: { next: { href: "::::" } }, resources: [] });
    try {
      expect((await listAlbumAssets(connection, "cat", "alb")).next).toBeNull();
    } finally {
      s.restore();
    }
  });

  it("follows the cursor verbatim rather than rebuilding the path", async () => {
    const s = stub({ resources: [] });
    try {
      await listAlbumAssets(connection, "cat", "alb", "/v2/handed/back?x=1");
      expect(s.calls[0]).toBe("https://lr.adobe.io/v2/handed/back?x=1");
    } finally {
      s.restore();
    }
  });

  it("survives a page with no resources at all", async () => {
    const s = stub({});
    try {
      const page = await listAlbumAssets(connection, "cat", "alb");
      expect(page).toEqual({ assets: [], next: null });
    } finally {
      s.restore();
    }
  });
});
