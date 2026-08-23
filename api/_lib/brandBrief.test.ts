import { describe, expect, it } from "vitest";
import type { BoardItemRow } from "./boards.js";
import { brandVersionOf, withBrandKits } from "./brandBrief.js";

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
    // Quoted from kitPromptText rather than restated, so this test does not
    // become a second definition of the prompt format.
    expect(String(cfg(out[0]).brandText)).toContain("#101a2b");
    expect(String(cfg(out[0]).brandText)).toContain("Plain and unhurried.");
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
    expect(String(cfg(out[0]).brandText)).toContain("#abcdef");
    expect(String(cfg(out[0]).brandText)).toContain("Terse.");
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
