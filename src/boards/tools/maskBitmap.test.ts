import { describe, expect, it } from "vitest";
import type { BoardItem } from "../../types";
import { maskBitmapUrl } from "./maskBitmap";

/**
 * Which picture a mask is built against, and when a rendered one may be reused.
 *
 * Both wrong answers are silent and cost a generation. A mask reused across a
 * change of source is at the wrong pixel size, which fal stretches rather than
 * refuses — the tool then repaints a part of the picture nobody pointed at. A
 * mask rebuilt when it did not need to be is only an extra upload, so the
 * bias here is deliberately towards rebuilding.
 */

const CACHED = "https://blob.example/cached-mask.png";
const ORIGINAL = "https://blob.example/original.jpg";

const strokes = [{ points: [{ x: 0.5, y: 0.5 }], width: 0.1 }];

const item = (over: Partial<BoardItem> = {}): BoardItem =>
  ({
    config: { mask: { invert: false, strokes }, maskUrl: CACHED },
    height: 200,
    id: "item-1",
    imageUrl: ORIGINAL,
    kind: "photo",
    result: null,
    width: 300,
    x: 0,
    y: 0,
    z: 1,
    ...over,
  }) as BoardItem;

describe("maskBitmapUrl", () => {
  it("has nothing to send when nothing was painted", async () => {
    // Distinct from a failure: the runner reads null as grounds to refuse a
    // tool that needs a mask, which is the right answer here and the wrong one
    // for an upload that fell over.
    await expect(maskBitmapUrl(item({ config: null }))).resolves.toBeNull();
  });

  it("treats an empty stroke list as no mask at all", async () => {
    // Sent as a mask it would mean "change nothing" — a confusing answer to
    // having cleared the paint off a node.
    await expect(
      maskBitmapUrl(item({ config: { mask: { invert: false, strokes: [] } } }))
    ).resolves.toBeNull();
  });

  it("reuses a bitmap rendered against the same picture", async () => {
    // The graph-run path renders one before a run and caches it here. Building
    // a second identical bitmap would spend an upload to no purpose.
    await expect(maskBitmapUrl(item())).resolves.toBe(CACHED);
  });

  it("will not reuse one rendered against a different picture", async () => {
    // A tool works from the newest result, the cache was built from the
    // original, and the two are rarely the same size. Reused, the mask is
    // stretched over the result and the wrong area is repainted.
    //
    // It rebuilds rather than returning the cache, so this reaches the canvas
    // work that a test environment has no image to do — the point being that
    // it does *not* resolve to CACHED.
    const stale = item({
      result: { url: "https://blob.example/newer.png" },
    } as Partial<BoardItem>);
    await expect(maskBitmapUrl(stale)).rejects.toThrow();
  });

  it("has nothing to build from when the item carries no picture", async () => {
    await expect(
      maskBitmapUrl(
        item({ config: { mask: { invert: false, strokes } }, imageUrl: null })
      )
    ).resolves.toBeNull();
  });
});
