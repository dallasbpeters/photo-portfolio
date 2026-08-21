import { describe, expect, it } from "vitest";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../../../../config/canvas.js";
import type { BoardItem } from "../../../types";
import { BLANK_ITEM, dropComposites, dropOrigin } from "./placement";

/**
 * Where a new item lands, and what an edit invalidates.
 *
 * Both rules fail silently, which is why they are worth pinning. An item placed
 * at the wrong origin lands off screen and reads as the insert having done
 * nothing at all; a composite that is not cleared shows yesterday's arrangement
 * while looking perfectly current.
 */

const item = (over: Partial<BoardItem> & { id: string }): BoardItem => ({
  ...BLANK_ITEM,
  height: 100,
  kind: "reference",
  width: 100,
  x: 0,
  y: 0,
  z: 1,
  ...over,
});

describe("dropOrigin", () => {
  it("uses where you are looking, even on a board with items elsewhere", () => {
    // The canvas is far larger than the screen. Placing at the middle of the
    // *board* lands off screen on any board that has been panned, which reads
    // as the insert having done nothing.
    const items = [item({ id: "a", x: 9000, y: 7000 })];
    expect(dropOrigin(items, { x: 1200, y: 800 })).toEqual({ x: 1200, y: 800 });
  });

  it("falls back to the middle of the work when the view is unknown", () => {
    const items = [
      item({ id: "a", x: 1000, y: 1000 }),
      item({ id: "b", x: 2000, y: 1400 }),
    ];
    // Centres of the two items are (1050,1050) and (2050,1450).
    expect(dropOrigin(items, null)).toEqual({ x: 1550, y: 1250 });
  });

  it("falls back to the canvas centre only when the board is empty", () => {
    expect(dropOrigin([], null)).toEqual({
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
    });
  });

  it("is the item's own centre when there is exactly one", () => {
    const items = [item({ height: 200, id: "a", width: 400, x: 100, y: 50 })];
    expect(dropOrigin(items, null)).toEqual({ x: 300, y: 150 });
  });

  it("ignores item size asymmetry — it centres on centres, not on edges", () => {
    const items = [
      item({ height: 10, id: "small", width: 10, x: 0, y: 0 }),
      item({ height: 1000, id: "huge", width: 1000, x: 1000, y: 1000 }),
    ];
    // Centres: (5,5) and (1500,1500) -> midpoint (752.5, 752.5).
    expect(dropOrigin(items, null)).toEqual({ x: 752.5, y: 752.5 });
  });
});

describe("dropComposites", () => {
  const composite = (url: string | null) =>
    item({
      config: url === null ? {} : { compositeUrl: url },
      id: "c",
      kind: "op",
      nodeType: "composite",
    });

  it("clears a rendered composite, because any edit can invalidate it", () => {
    const [out] = dropComposites([composite("https://example.test/c.png")]);
    expect(out?.config?.compositeUrl).toBeNull();
  });

  it("keeps every other setting on the node it clears", () => {
    const node = item({
      config: {
        background: "white",
        compositeUrl: "https://example.test/c.png",
      },
      id: "c",
      kind: "op",
      nodeType: "composite",
    });
    const [out] = dropComposites([node]);
    expect(out?.config).toEqual({ background: "white", compositeUrl: null });
  });

  it("leaves a composite that has never been rendered alone", () => {
    const node = composite(null);
    const [out] = dropComposites([node]);
    // Same object: nothing to clear means nothing to re-render.
    expect(out).toBe(node);
  });

  it("does not touch nodes of any other type", () => {
    const generate = item({
      config: { compositeUrl: "https://example.test/x.png" },
      id: "g",
      kind: "op",
      nodeType: "generate",
    });
    const [out] = dropComposites([generate]);
    expect(out).toBe(generate);
  });

  it("does not touch plain board items", () => {
    const photo = item({ id: "p", kind: "photo" });
    const [out] = dropComposites([photo]);
    expect(out).toBe(photo);
  });

  it("clears every composite on the board, not just the first", () => {
    const list = [
      composite("https://example.test/1.png"),
      item({ id: "mid", kind: "photo" }),
      { ...composite("https://example.test/2.png"), id: "c2" },
    ];
    const out = dropComposites(list);
    expect(out[0]?.config?.compositeUrl).toBeNull();
    expect(out[2]?.config?.compositeUrl).toBeNull();
    expect(out[1]).toBe(list[1]);
  });

  it("clears a halftone's render, for the same reason as a composite", () => {
    // A halftone is a picture of its settings and its wired image. Left behind,
    // a stale render exports yesterday's colours while the node shows today's.
    const node = item({
      config: { dots: "#27444D", renderUrl: "https://example.test/h.png" },
      id: "h",
      kind: "op",
      nodeType: "standard",
    });
    const [out] = dropComposites([node]);
    expect(out?.config?.renderUrl).toBeNull();
    // Every other setting survives — only the picture is stale.
    expect(out?.config?.dots).toBe("#27444D");
  });

  it("leaves a halftone that has not been rendered alone", () => {
    const node = item({
      config: { dots: "#27444D" },
      id: "h",
      kind: "op",
      nodeType: "standard",
    });
    const [out] = dropComposites([node]);
    expect(out).toBe(node);
  });

  it("preserves order and length", () => {
    const list = [
      item({ id: "a" }),
      composite("https://example.test/1.png"),
      item({ id: "b" }),
    ];
    expect(dropComposites(list).map((i) => i.id)).toEqual(["a", "c", "b"]);
  });
});

describe("BLANK_ITEM", () => {
  it("leaves every kind-specific field empty", () => {
    // Spread first and overridden, so adding a field to BoardItem is not four
    // identical edits. A non-null default here would leak into every new item.
    for (const value of Object.values(BLANK_ITEM)) {
      expect(value).toBeNull();
    }
  });
});
