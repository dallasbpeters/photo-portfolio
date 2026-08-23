import { describe, expect, it } from "vitest";
import type { BoardItemRow } from "./boards.js";
import { brandVersionOf, withBrandKits } from "./brandBrief.js";
import { brandLogoOf } from "./brandLogo.js";

/**
 * The behaviour worth pinning here is what happens when the library and the
 * board disagree — a kit deleted, a sub-brand stating nothing, a database that
 * has not run patch 031. Each of those has a right answer that is "contribute
 * nothing and keep running", and each would otherwise be discovered as a failed
 * board run.
 */

const row = (over: Partial<BoardItemRow> = {}): BoardItemRow =>
  ({
    config: {},
    id: "item-1",
    image_url: null,
    kind: "op",
    node_type: "brand",
    photo_url: null,
    result: null,
    ...over,
  }) as BoardItemRow;

/** `config` is `unknown` on the row, as it is in the database. */
const cfg = (item: BoardItemRow): Record<string, unknown> =>
  (item.config ?? {}) as Record<string, unknown>;

/** A stub that answers one query with the rows given. */
const sqlReturning = (rows: unknown[]) => {
  const tag = ((_strings: TemplateStringsArray, ..._values: unknown[]) =>
    Promise.resolve(rows)) as unknown as Parameters<typeof withBrandKits>[0];
  return tag;
};

/** A stub whose query rejects, as an unmigrated database would. */
const sqlFailing = () =>
  ((_strings: TemplateStringsArray, ..._values: unknown[]) =>
    Promise.reject(
      new Error('relation "brand_kits" does not exist')
    )) as unknown as Parameters<typeof withBrandKits>[0];

const KIT = "11111111-1111-1111-1111-111111111111";
const VERSION = "22222222-2222-2222-2222-222222222222";

describe("withBrandKits", () => {
  it("does not query at all when no node names a kit", async () => {
    // The stub would throw if called, so reaching the end proves it was not.
    const rows = [row({ config: {}, node_type: "generate" })];
    await expect(withBrandKits(sqlFailing(), rows)).resolves.toBe(rows);
  });

  it("ignores an id that is not a uuid", async () => {
    const rows = [row({ config: { brandKitId: "not-a-uuid" } })];
    await expect(withBrandKits(sqlFailing(), rows)).resolves.toBe(rows);
  });

  it("folds the kit's prompt text and version onto the row", async () => {
    const out = await withBrandKits(
      sqlReturning([
        {
          doc: {
            palette: [{ name: "Ink", role: "", value: "#101a2b" }],
            voice: "Plain and unhurried.",
          },
          id: KIT,
          parent_doc: null,
          version_id: VERSION,
        },
      ]),
      [row({ config: { brandKitId: KIT } })]
    );
    expect(cfg(out[0])).toMatchObject({
      brandKitId: KIT,
      brandKitVersionId: VERSION,
    });
    /*
     * Described, and containing no hex at all.
     *
     * The palette used to go in as `#101a2b` and the models that letter well
     * drew it onto the picture. The exact value still travels — on
     * `brandPalette`, for `color_palette` — but never in the words.
     */
    const said = String(cfg(out[0]).brandText);
    expect(said).toContain("very dark blue");
    expect(said).toContain("Plain and unhurried.");
    expect(said).not.toContain("#");
    expect(cfg(out[0]).brandPalette).toEqual(["#101a2b"]);
  });

  it("resolves a sub-brand against its parent", async () => {
    // The child states only a voice; the palette must still arrive.
    const out = await withBrandKits(
      sqlReturning([
        {
          doc: { palette: [], voice: "Terse." },
          id: KIT,
          parent_doc: {
            palette: [{ name: "Parent", role: "", value: "#abcdef" }],
            voice: "",
          },
          version_id: VERSION,
        },
      ]),
      [row({ config: { brandKitId: KIT } })]
    );
    const said = String(cfg(out[0]).brandText);
    expect(said).toContain("pale blue");
    expect(said).toContain("Terse.");
    expect(said).not.toContain("#");
    // The parent's exact value still reaches color_palette.
    expect(cfg(out[0]).brandPalette).toEqual(["#abcdef"]);
  });

  it("contributes nothing for a kit that is gone, and keeps the run alive", async () => {
    // No fallback copy on the node, deliberately: generating against a brand
    // somebody deleted is worse than generating without one.
    const out = await withBrandKits(sqlReturning([]), [
      row({ config: { brandKitId: KIT } }),
    ]);
    expect(cfg(out[0]).brandText).toBe("");
    expect(cfg(out[0]).brandKitVersionId).toBeNull();
  });

  it("survives a database that has not run patch 031", async () => {
    // The whole run would otherwise fail on a missing relation, so an
    // unmigrated database could generate nothing at all rather than merely
    // generating without a brand.
    const out = await withBrandKits(sqlFailing(), [
      row({ config: { brandKitId: KIT } }),
    ]);
    expect(cfg(out[0]).brandText).toBe("");
  });

  it("leaves every other node untouched", async () => {
    const other = row({ config: { prompt: "keep me" }, node_type: "generate" });
    const out = await withBrandKits(
      sqlReturning([
        { doc: {}, id: KIT, parent_doc: null, version_id: VERSION },
      ]),
      [other, row({ config: { brandKitId: KIT } })]
    );
    expect(out[0]).toBe(other);
  });
});

describe("brandVersionOf", () => {
  it("finds the version a resolved brand node carries", () => {
    expect(
      brandVersionOf([
        row({ config: {}, node_type: "generate" }),
        row({ config: { brandKitVersionId: VERSION } }),
      ])
    ).toBe(VERSION);
  });

  it("is null when no brand fed the run", () => {
    expect(brandVersionOf([row({ node_type: "generate" })])).toBeNull();
  });

  it("is null for a brand node whose kit did not resolve", () => {
    expect(
      brandVersionOf([row({ config: { brandKitVersionId: null } })])
    ).toBeNull();
  });

  it("takes the first by row order, so the same board stamps the same answer", () => {
    const a = "33333333-3333-3333-3333-333333333333";
    expect(
      brandVersionOf([
        row({ config: { brandKitVersionId: a } }),
        row({ config: { brandKitVersionId: VERSION } }),
      ])
    ).toBe(a);
  });
});

describe("resolving which logo a Brand node stamps", () => {
  const KIT_WITH_LOGOS = {
    logos: [
      {
        clearSpace: 0.5,
        label: "Primary",
        minWidth: 120,
        rules: "never recoloured",
        url: "https://blob/primary.svg",
      },
      {
        clearSpace: 0.25,
        label: "Mark only",
        minWidth: 48,
        rules: "",
        url: "https://blob/mark.svg",
      },
    ],
    palette: [{ name: "Ink", role: "", value: "#101a2b" }],
    voice: "",
  };

  it("matches the chosen logo by URL and carries its own rules", async () => {
    /*
     * By URL, not by index. An index moves: delete the first logo and every
     * node pointing at "the second one" silently starts stamping a different
     * mark, which is the kind of wrong nobody notices until it is printed.
     */
    const out = await withBrandKits(
      sqlReturning([
        { doc: KIT_WITH_LOGOS, id: KIT, parent_doc: null, version_id: VERSION },
      ]),
      [row({ config: { brandKitId: KIT, logoUrl: "https://blob/mark.svg" } })]
    );
    expect(cfg(out[0])).toMatchObject({
      logoClearSpace: 0.25,
      logoMinWidth: 48,
      logoUrl: "https://blob/mark.svg",
    });
  });

  it("stops resolving a logo that has left the kit", async () => {
    // The node keeps its pointer; the stamp simply does not happen, and the
    // words still travel. Better than stamping whatever took its place.
    const out = await withBrandKits(
      sqlReturning([
        { doc: KIT_WITH_LOGOS, id: KIT, parent_doc: null, version_id: VERSION },
      ]),
      [
        row({
          config: { brandKitId: KIT, logoUrl: "https://blob/deleted.svg" },
        }),
      ]
    );
    expect(cfg(out[0]).logoUrl).toBeNull();
    expect(String(cfg(out[0]).brandText)).toContain("very dark blue");
  });

  it("asks the model to leave room only when a logo will be stamped", async () => {
    // The instruction is the opposite of "use this logo" — see
    // logoReservationText. Wasted on a picture that will never receive one.
    const withLogo = await withBrandKits(
      sqlReturning([
        { doc: KIT_WITH_LOGOS, id: KIT, parent_doc: null, version_id: VERSION },
      ]),
      [
        row({
          config: {
            brandKitId: KIT,
            logoPlacement: "top-left",
            logoUrl: "https://blob/primary.svg",
          },
        }),
      ]
    );
    const said = String(cfg(withLogo[0]).brandText);
    expect(said).toContain("top left");
    expect(said).toContain("do not draw any logo");

    const withoutLogo = await withBrandKits(
      sqlReturning([
        { doc: KIT_WITH_LOGOS, id: KIT, parent_doc: null, version_id: VERSION },
      ]),
      [row({ config: { brandKitId: KIT } })]
    );
    expect(String(cfg(withoutLogo[0]).brandText)).not.toContain(
      "do not draw any logo"
    );
  });
});

describe("brandLogoOf", () => {
  const wire = (from: string, to: string) => ({
    source_item_id: from,
    target_item_id: to,
  });

  it("finds the logo a wired Brand node offers", () => {
    const brand = row({
      config: {
        logoClearSpace: 0.5,
        logoMinWidth: 120,
        logoPlacement: "top-left",
        logoUrl: "https://blob/primary.svg",
        logoWidth: 20,
      },
      id: "brand-1",
    });
    const gen = row({ id: "gen-1", node_type: "generate" });
    expect(
      brandLogoOf("gen-1", [brand, gen], [wire("brand-1", "gen-1")])
    ).toEqual({
      clearSpace: 0.5,
      minWidth: 120,
      placement: "top-left",
      url: "https://blob/primary.svg",
      widthPercent: 20,
    });
  });

  it("is null for a brand with no logo chosen", () => {
    // A brand wired in for its colours alone contributes words and no stamp.
    const brand = row({ config: { brandKitId: KIT }, id: "brand-1" });
    const gen = row({ id: "gen-1", node_type: "generate" });
    expect(
      brandLogoOf("gen-1", [brand, gen], [wire("brand-1", "gen-1")])
    ).toBeNull();
  });

  it("falls back to defaults for a placement it does not recognise", () => {
    const brand = row({
      config: {
        logoPlacement: "somewhere-else",
        logoUrl: "https://blob/a.svg",
      },
      id: "brand-1",
    });
    const gen = row({ id: "gen-1", node_type: "generate" });
    const found = brandLogoOf(
      "gen-1",
      [brand, gen],
      [wire("brand-1", "gen-1")]
    );
    expect(found?.placement).toBe("bottom-right");
    // And a missing width becomes the declared default rather than zero.
    expect(found?.widthPercent).toBe(12);
  });

  it("ignores wires that end somewhere else", () => {
    const brand = row({ config: { logoUrl: "https://blob/a.svg" }, id: "b" });
    const gen = row({ id: "gen-1", node_type: "generate" });
    expect(brandLogoOf("gen-1", [brand, gen], [wire("b", "other")])).toBeNull();
  });
});
