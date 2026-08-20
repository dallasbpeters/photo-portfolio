import { describe, expect, it } from "vitest";
import type { BoardItem, BoardWire } from "../types";
import { wiredImagesFor } from "./canvas/wiredPreviews";
import { currentImageUrl, outputImageOf } from "./itemOutput";

/**
 * Which version of a picture travels down a wire.
 *
 * An edit — by hand, by a tool, or through Affinity — is written back as a new
 * version on `result`, exactly as a generation is. The canvas learned to read
 * it and the wires did not, so an edited photograph drew correctly on the board
 * and handed its untouched original to everything it fed: the shader restyled
 * the picture as it had been before the edit, and looked from the outside like
 * a shader that had ignored the edit rather than a wire that had.
 */

const ORIGINAL = "https://example.test/original.png";
const EDITED = "https://example.test/edited.png";

const item = (over: Partial<BoardItem>): BoardItem => ({
  body: null,
  config: {},
  creditName: null,
  creditUrl: null,
  fontSize: null,
  height: 100,
  id: "p1",
  imageUrl: ORIGINAL,
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

const edited = (over: Partial<BoardItem> = {}) =>
  item({ result: { url: EDITED } as BoardItem["result"], ...over });

describe("an edited picture hands over the edit", () => {
  it("down a wire", () => {
    expect(outputImageOf(edited())).toBe(EDITED);
  });

  it("and the original when nothing has been done to it", () => {
    expect(outputImageOf(item({}))).toBe(ORIGINAL);
  });

  it("for a reference as well as a photograph", () => {
    expect(outputImageOf(edited({ kind: "reference" }))).toBe(EDITED);
  });

  it("through a frame", () => {
    // A frame hands on what is sitting on it, and each of those may have been
    // edited too.
    const frame = item({
      height: 500,
      id: "f",
      imageUrl: null,
      kind: "frame",
      width: 500,
      x: 0,
      y: 0,
    });
    const inside = edited({ height: 50, id: "p1", width: 50, x: 10, y: 10 });
    expect(outputImageOf(frame, [frame, inside])).toBe(EDITED);
  });

  it("and to a shader wired straight onto it", () => {
    const source = edited();
    const shader = item({
      id: "s",
      imageUrl: null,
      kind: "op",
      nodeType: "standard",
    });
    const wire: BoardWire = {
      id: "w",
      sourceItemId: "p1",
      sourcePort: "out",
      targetItemId: "s",
      targetPort: "image",
    };
    expect(
      wiredImagesFor("s", { items: [source, shader], wires: [wire] })
    ).toEqual([EDITED]);
  });
});

describe("currentImageUrl", () => {
  it("prefers the stored version", () => {
    expect(currentImageUrl(edited())).toBe(EDITED);
  });

  it("falls back to the item's own picture", () => {
    expect(currentImageUrl(item({}))).toBe(ORIGINAL);
  });

  it("is null when there is no picture at all", () => {
    expect(currentImageUrl(item({ imageUrl: null }))).toBeNull();
  });
});
