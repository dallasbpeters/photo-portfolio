import { describe, expect, it } from "vitest";
import type { BoardItem, BoardWire } from "../../types";
import { wiredImagesFor } from "./wiredPreviews";

/**
 * How many pictures the browser thinks are wired into a shader.
 *
 * The count has to match what the server resolves, because the two halves of a
 * shader run are split between them: the browser draws one file per picture,
 * and the run then asks for the file belonging to each variation. A browser
 * that finds one picture where the server finds twenty-two leaves twenty-one
 * variations with nothing to hand back — which is exactly what happened, and it
 * came back as "22 images failed".
 */

const item = (over: Partial<BoardItem>): BoardItem => ({
  body: null,
  config: {},
  creditName: null,
  creditUrl: null,
  fontSize: null,
  height: 100,
  id: "x",
  imageUrl: null,
  kind: "photo",
  nodeType: null,
  photoId: null,
  result: null,
  runError: null,
  runState: "idle",
  textStyle: null,
  thumbUrl: null,
  width: 100,
  x: 0,
  y: 0,
  z: 1,
  ...over,
});

const photo = (id: string): BoardItem =>
  item({ id, imageUrl: `https://example.test/${id}.png` });

const wire = (sourceItemId: string, targetItemId: string): BoardWire => ({
  id: `${sourceItemId}->${targetItemId}`,
  sourceItemId,
  sourcePort: "out",
  targetItemId,
  targetPort: "image",
});

describe("wiredImagesFor", () => {
  it("expands a Batch node into every picture it holds", () => {
    // One wire, many pictures. This is the case that failed.
    const photos = Array.from({ length: 22 }, (_, i) => photo(`p${i}`));
    const batch = item({ id: "b", kind: "op", nodeType: "batch" });
    const shader = item({ id: "s", kind: "op", nodeType: "standard" });
    const wires = [...photos.map((p) => wire(p.id, "b")), wire("b", "s")];
    expect(
      wiredImagesFor("s", { items: [...photos, batch, shader], wires })
    ).toHaveLength(22);
  });

  it("honours the batch's own limit", () => {
    // "Only the first N" bounds the run, so it must bound the renders too, or
    // the browser draws pictures nothing will ever ask for.
    const photos = Array.from({ length: 5 }, (_, i) => photo(`p${i}`));
    const batch = item({
      config: { limit: 2 },
      id: "b",
      kind: "op",
      nodeType: "batch",
    });
    const shader = item({ id: "s", kind: "op", nodeType: "standard" });
    const wires = [...photos.map((p) => wire(p.id, "b")), wire("b", "s")];
    expect(
      wiredImagesFor("s", { items: [...photos, batch, shader], wires })
    ).toHaveLength(2);
  });

  it("drops the ones struck off the contact sheet", () => {
    const photos = Array.from({ length: 3 }, (_, i) => photo(`p${i}`));
    const batch = item({
      config: { excluded: ["https://example.test/p1.png"] },
      id: "b",
      kind: "op",
      nodeType: "batch",
    });
    const shader = item({ id: "s", kind: "op", nodeType: "standard" });
    const wires = [...photos.map((p) => wire(p.id, "b")), wire("b", "s")];
    expect(
      wiredImagesFor("s", { items: [...photos, batch, shader], wires })
    ).toEqual(["https://example.test/p0.png", "https://example.test/p2.png"]);
  });

  it("takes one picture from one photograph", () => {
    const shader = item({ id: "s", kind: "op", nodeType: "standard" });
    expect(
      wiredImagesFor("s", {
        items: [photo("p0"), shader],
        wires: [wire("p0", "s")],
      })
    ).toEqual(["https://example.test/p0.png"]);
  });

  it("is empty when nothing is wired in", () => {
    const shader = item({ id: "s", kind: "op", nodeType: "standard" });
    expect(wiredImagesFor("s", { items: [shader], wires: [] })).toEqual([]);
  });
});
