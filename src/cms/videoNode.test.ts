import { describe, expect, it } from "vitest";
import { PageVideo } from "./videoNode";

/**
 * The node that makes a clip renderable in a page.
 *
 * Its absence failed silently in two directions, which is why it is tested at
 * all: inserted through `setImage` a clip became an `<img>` and showed a broken
 * icon, and rendered by `PageContent` an unknown node type is *skipped* — so a
 * video would simply not be in the published page, with nothing to say why.
 */
describe("PageVideo", () => {
  it("is a block, so it sits in the flow rather than inside a paragraph", () => {
    expect(PageVideo.config.group).toBe("block");
  });

  it("is an atom: there is nothing inside a clip to put a caret in", () => {
    expect(PageVideo.config.atom).toBe(true);
  });

  it("is named what PageContent looks for", () => {
    // The renderer dispatches on this string. A rename here without one there
    // means every existing video quietly disappears from its page.
    expect(PageVideo.name).toBe("pageVideo");
  });

  it("parses a video element back, so a saved page round-trips", () => {
    const rules = PageVideo.config.parseHTML?.call(PageVideo as never) as {
      tag: string;
    }[];
    expect(rules.map((rule) => rule.tag)).toContain("video[src]");
  });

  it("carries the same align and width the formatted image does", () => {
    // One vocabulary for the two decisions, so the toolbar's controls mean the
    // same thing on both and PageContent lays them out alike.
    const attributes = PageVideo.config.addAttributes?.call(
      PageVideo as never
    ) as Record<string, unknown>;
    expect(Object.keys(attributes).sort()).toEqual([
      "align",
      "src",
      "title",
      "width",
    ]);
  });
});
